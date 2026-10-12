import { MemoryStore, store } from "../lib/store";
import { newSession, beginRun } from "../lib/domain";
import { runAgent } from "../lib/agent";
import { writeFile } from "node:fs/promises";
async function main() {
  const mem = new MemoryStore();
  const s = await newSession(mem),
    r = await beginRun(mem, s.id);
  const start = Date.now();
  try {
    const result = await runAgent(
      store(),
      s,
      r,
      AbortSignal.timeout(90000),
      async (phase) => console.log(Date.now() - start, phase),
    );
    await writeFile("output/agent-debug.json", JSON.stringify(result, null, 2));
    console.log("COMPLETED", JSON.stringify(result));
  } catch (e) {
    console.log(e);
    console.log((e as any).metrics);
  }
}
main();
