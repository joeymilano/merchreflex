import { Type } from "@google/genai";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { genAiClient, GENAI_ENDPOINT } from "../lib/agent";
async function main() {
  const ai = genAiClient();
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const tests = [
    {
      name: "text",
      contents: "Return exactly: MerchReflex ready",
      config: { maxOutputTokens: 128 },
    },
    {
      name: "image",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Name the two main objects. One sentence." },
            {
              inlineData: {
                mimeType: "image/png",
                data: (await readFile("public/commuter-one.png")).toString(
                  "base64",
                ),
              },
            },
          ],
        },
      ],
      config: { maxOutputTokens: 256 },
    },
    {
      name: "tool",
      contents: "Call inspect_page to read the product page.",
      config: {
        maxOutputTokens: 256,
        tools: [
          {
            functionDeclarations: [
              {
                name: "inspect_page",
                description: "Read product page",
                parameters: { type: Type.OBJECT, properties: {} },
              },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: "ANY" as never } },
      },
    },
  ];
  const results = [];
  for (const t of tests) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: t.contents,
        config: t.config,
      });
      const result = {
        test: t.name,
        model,
        endpoint: GENAI_ENDPOINT,
        text: r.text,
        tools: r.functionCalls,
        usage: r.usageMetadata,
      };
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (e) {
      console.error(
        JSON.stringify({
          test: t.name,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      process.exitCode = 1;
      break;
    }
  }
  await mkdir("output", { recursive: true });
  await writeFile(
    "output/model-smoke.json",
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
}
main();
