import { readFile, mkdir, writeFile } from "node:fs/promises";
import { MemoryStore, store } from "../lib/store";
import { newSession, beginRun, createEvidence, hash, now } from "../lib/domain";
import { runAgent, PROMPT, AGENT_PROMPT_HASH } from "../lib/agent";

async function main() {
  const all = JSON.parse(await readFile("eval/cases.json", "utf8"));
  const split = process.env.EVAL_SPLIT || "development";
  const cases = all.filter((c: any) => split === "all" || c.split === split);
  if (!cases.length) throw new Error("No cases for " + split);
  if (
    cases.some((c: any) => c.split === "holdout") &&
    process.env.RUN_FROZEN_HOLDOUT !== "yes"
  )
    throw new Error(
      "Holdout is frozen. Explicit RUN_FROZEN_HOLDOUT=yes is required. Do not tune after seeing it.",
    );
  const out = process.env.EVAL_OUTPUT || "output/evaluation";
  await mkdir(out, { recursive: true });
  const results: any[] = [];
  const tasks = cases.flatMap((c: any) =>
    ["workflow", "baseline"].map((mode) => ({ c, mode })),
  );
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const { c, mode } = tasks[cursor++];
      const file = `${out}/${c.id}-${mode}.json`;
      try {
        const prior = JSON.parse(await readFile(file, "utf8"));
        results.push(prior);
        continue;
      } catch {}
      const mem = new MemoryStore();
      const s = await newSession(mem, c.sku);
      s.evidence = s.evidence.filter((e) => e.kind !== "feedback");
      s.evidence.push(
        createEvidence(
          s,
          "feedback",
          "Evaluation feedback · synthetic",
          c.review,
        ),
      );
      if (c.conflict)
        s.evidence.push(
          createEvidence(
            s,
            "spec",
            "Conflicting merchant specification · synthetic",
            c.conflict,
            true,
          ),
        );
      await mem.transact("sessions", s.id, () => ({ value: s, result: null }));
      const run = await beginRun(mem, s.id);
      const start = Date.now();
      let result;
      const provenance = {
        caseId: c.id,
        mode,
        sku: c.sku,
        split: c.split,
        category: c.category,
        expected: c.expected,
        at: now(),
        model: run.model,
        promptHash: AGENT_PROMPT_HASH,
        caseFileHash: hash(all),
        record: { page: s.versions[0].content, evidence: s.evidence },
        humanReview: "pending",
      };
      try {
        const r = await runAgent(
          store(),
          s,
          run,
          AbortSignal.timeout(90000),
          async () => {},
          mode as "workflow" | "baseline",
        );
        result = {
          ...provenance,
          durationMs: Date.now() - start,
          status: "completed",
          ...r,
        };
      } catch (e) {
        result = {
          ...provenance,
          durationMs: Date.now() - start,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          metrics: (e as any).metrics,
        };
      }
      results.push(result);
      await writeFile(file, JSON.stringify(result, null, 2));
      console.log(
        JSON.stringify({
          caseId: c.id,
          mode,
          status: result.status,
          durationMs: result.durationMs,
        }),
      );
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(2, Number(process.env.EVAL_CONCURRENCY || 2)) },
      worker,
    ),
  );
  const modes = ["workflow", "baseline"].map((mode) => {
    const rows = results.filter((r) => r.mode === mode),
      times = rows.map((r) => r.durationMs).sort((a, b) => a - b);
    return {
      mode,
      total: rows.length,
      completed: rows.filter((r) => r.status === "completed").length,
      failed: rows.filter((r) => r.status === "failed").length,
      p50Ms: times[Math.ceil(times.length * 0.5) - 1],
      p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      estimatedUsd: rows.reduce(
        (n, r) => n + (r.metrics?.usage?.estimatedUsd || 0),
        0,
      ),
    };
  });
  const summary = {
    at: now(),
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    promptHash: AGENT_PROMPT_HASH,
    caseFileHash: hash(all),
    split,
    modes,
    humanSemanticReview:
      "Pending. Completion is not accuracy. Failures are included in latency.",
    execution: "Local evaluation runner; not Cloud Run latency.",
  };
  await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
