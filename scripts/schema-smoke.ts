import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { MODEL_SCHEMA } from "../lib/model-schema";
import { ProposalSchema } from "../lib/types";
const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: "global",
});
async function main() {
  const r = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents:
      "Return empty issues and empty changes. There is no evidence, so do not invent any.",
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: MODEL_SCHEMA,
      maxOutputTokens: 256,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      httpOptions: { timeout: 40000 },
    },
  });
  console.log(ProposalSchema.parse(JSON.parse(r.text!)));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
