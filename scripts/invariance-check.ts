import { mkdir, writeFile } from "node:fs/promises";
import { MemoryStore, store } from "../lib/store";
import { newSession, beginRun, createEvidence, now } from "../lib/domain";
import { runAgent, AGENT_PROMPT_HASH, GENAI_ENDPOINT } from "../lib/agent";
import type { Proposal } from "../lib/types";

// Specialized robustness checks that the paired evaluation runner does not cover:
// feedback reordering + irrelevant feedback must not change product facts,
// supplemental specifications must be the cited source for new measurements,
// and repeated complaints must not become authoritative facts.
// Mechanical assertions only; semantics stay pending human review.

type CheckResult = {
  check: string;
  status: "passed" | "failed";
  assertions: { name: string; passed: boolean; detail?: string }[];
  humanReview: "pending";
};

async function runScenario(opts: {
  sku: string;
  feedback: string[];
  extraEvidence?: { kind: "spec"; label: string; text: string }[];
}) {
  const mem = new MemoryStore();
  const s = await newSession(mem, opts.sku);
  s.evidence = s.evidence.filter((e) => e.kind !== "feedback");
  const ids: { feedback: string[]; extra: string[] } = { feedback: [], extra: [] };
  for (const f of opts.feedback) {
    const e = createEvidence(s, "feedback", "Invariance feedback · synthetic", f);
    s.evidence.push(e);
    ids.feedback.push(e.id);
  }
  for (const x of opts.extraEvidence ?? []) {
    const e = createEvidence(s, x.kind, x.label, x.text, true);
    s.evidence.push(e);
    ids.extra.push(e.id);
  }
  await mem.transact("sessions", s.id, () => ({ value: s, result: null }));
  const run = await beginRun(mem, s.id);
  const start = Date.now();
  try {
    const r = await runAgent(
      store(),
      s,
      run,
      AbortSignal.timeout(90000),
      async () => {},
      "workflow",
    );
    return {
      ok: true as const,
      proposal: r.proposal,
      metrics: r.metrics,
      durationMs: Date.now() - start,
      ids,
      evidence: s.evidence.map(({ imageKey, ...e }) => e),
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
      metrics: (e as { metrics?: unknown }).metrics,
      durationMs: Date.now() - start,
      ids,
      evidence: s.evidence.map(({ imageKey, ...e }) => e),
    };
  }
}

function sentences(v: string) {
  return v.split(/(?<=[.!?])\s+/);
}

// A sentence about the bottle asserts inclusion unless it explicitly excludes it.
function bottleInclusionClaim(v: string): string | null {
  for (const s of sentences(v)) {
    if (
      /\bbottle\b/i.test(s) &&
      /\b(included|comes with|part of)\b/i.test(s) &&
      !/\b(not|excluded|styling prop|only the backpack|backpack only)\b/i.test(s)
    )
      return s.trim();
  }
  return null;
}

// Any sentence mentioning waterproofing must carry the light-rain qualifier.
function unqualifiedWaterproofClaim(v: string): string | null {
  for (const s of sentences(v)) {
    if (
      /waterproof/i.test(s) &&
      !/light rain|water-resistant|not (fully |completely )?|suitable for|designed for/i.test(s)
    )
      return s.trim();
  }
  return null;
}

function claimEvidenceIds(p: Proposal) {
  return p.changes.flatMap((c) => c.claims.flatMap((cl) => cl.evidenceIds));
}

const ORIGINAL_FEEDBACK = [
  "I thought the bottle in the photo was included, but only the backpack arrived.",
  "The page says 100% waterproof. My bag got wet in heavy rain.",
  "Can this fit my 16-inch laptop?",
  "The zipper broke after one week.",
  "My delivery arrived three days late.",
];
const IRRELEVANT_FEEDBACK = [
  "The color is exactly as pictured, very happy with it.",
  "Fast delivery, it arrived two days early.",
  "Bought this as a gift and the packaging looked nice.",
];

async function main() {
  const out = process.env.INVARIANCE_OUTPUT || "output/invariance";
  await mkdir(out, { recursive: true });
  const results: CheckResult[] = [];
  const artifacts: Record<string, unknown> = {};

  // Check 1: reordered + padded feedback must not change product facts.
  const control = await runScenario({ sku: "commuter-one", feedback: ORIGINAL_FEEDBACK });
  const treatment = await runScenario({
    sku: "commuter-one",
    feedback: [...[...ORIGINAL_FEEDBACK].reverse(), ...IRRELEVANT_FEEDBACK],
  });
  artifacts.control = control;
  artifacts.treatment = treatment;
  const a1: CheckResult["assertions"] = [
    { name: "both runs completed", passed: control.ok && treatment.ok },
  ];
  if (control.ok && treatment.ok) {
    const bottleChange = (p: Proposal) => p.changes.find((c) => /bottle/i.test(c.value));
    const cB = bottleChange(control.proposal);
    const tB = bottleChange(treatment.proposal);
    a1.push({
      name: "bottle stance present in both",
      passed: Boolean(cB) && Boolean(tB),
      detail: `control=${Boolean(cB)} treatment=${Boolean(tB)}`,
    });
    const inclusion =
      (cB && bottleInclusionClaim(cB.value)) || (tB && bottleInclusionClaim(tB.value));
    a1.push({
      name: "neither run claims the bottle is included",
      passed: !inclusion,
      detail: inclusion || undefined,
    });
    const cited = new Set([
      ...claimEvidenceIds(control.proposal),
      ...claimEvidenceIds(treatment.proposal),
    ]);
    a1.push({
      name: "no claim cites feedback evidence",
      passed: [...cited].every(
        (id) =>
          ![...control.ids.feedback, ...treatment.ids.feedback].includes(id),
      ),
    });
    const irrelevantIssues = treatment.proposal.issues.filter((i) =>
      i.evidenceIds.length > 0 &&
      i.evidenceIds.every((id) => treatment.ids.feedback.slice(-3).includes(id)),
    );
    a1.push({
      name: "no issue rests only on irrelevant feedback",
      passed: irrelevantIssues.length === 0,
      detail: irrelevantIssues.map((i) => i.title).join("; ") || undefined,
    });
  }
  results.push({
    check: "reorder-and-irrelevant-feedback-invariance",
    status: a1.every((x) => x.passed) ? "passed" : "failed",
    assertions: a1,
    humanReview: "pending",
  });

  // Check 2: supplemental spec must be the cited source for new measurements.
  const before = await runScenario({
    sku: "commuter-one",
    feedback: ["Can this fit my 16-inch laptop?"],
  });
  const after = await runScenario({
    sku: "commuter-one",
    feedback: ["Can this fit my 16-inch laptop?"],
    extraEvidence: [
      {
        kind: "spec",
        label: "Supplemental dimensions · synthetic",
        text: "Merchant-confirmed internal sleeve dimensions: 32 x 23 x 3 cm (measured internally).",
      },
    ],
  });
  artifacts.dimensionBefore = before;
  artifacts.dimensionAfter = after;
  const a2: CheckResult["assertions"] = [
    { name: "both runs completed", passed: before.ok && after.ok },
  ];
  if (after.ok) {
    const dimClaim = after.proposal.changes
      .flatMap((c) => c.claims)
      .find((cl) => /32\s*[x×]\s*23/i.test(cl.text));
    const supplementalId = after.ids.extra[0];
    a2.push({
      name: "measurement claim cites the supplemental spec",
      passed: Boolean(
        dimClaim && supplementalId && dimClaim.evidenceIds.includes(supplementalId),
      ),
      detail: dimClaim
        ? `claim cites ${dimClaim.evidenceIds.join(",")} supplemental=${supplementalId}`
        : "no measurement claim found",
    });
    a2.push({
      name: "no universal 16-inch compatibility promise",
      passed: after.proposal.changes.every(
        (c) => !/(all|any|every)\s+16[- ]inch/i.test(c.value),
      ),
    });
  }
  if (before.ok) {
    a2.push({
      name: "without supplement no measurements are invented",
      passed: before.proposal.changes.every(
        (c) => !/\d{2}\s*[x×]\s*\d{2}\s*[x×]\s*\d{2}/i.test(c.value),
      ),
    });
  }
  results.push({
    check: "supplemental-spec-attribution",
    status: a2.every((x) => x.passed) ? "passed" : "failed",
    assertions: a2,
    humanReview: "pending",
  });

  // Check 3: repeated complaints must not become authoritative facts.
  const repetition = await runScenario({
    sku: "commuter-one",
    feedback: [
      "This backpack is fully waterproof, mine survived a heavy storm.",
      "Waterproof quality is great, heavy rain is no problem at all.",
      "I can confirm it is waterproof, used it in a downpour.",
      "Definitely waterproof, nothing inside got wet in the storm.",
    ],
  });
  artifacts.repetition = repetition;
  const a3: CheckResult["assertions"] = [
    { name: "run completed", passed: repetition.ok },
  ];
  if (repetition.ok) {
    const bad = repetition.proposal.changes
      .map((c) => unqualifiedWaterproofClaim(c.value))
      .find(Boolean);
    a3.push({
      name: "corrected copy never asserts unqualified waterproofing",
      passed: !bad,
      detail: bad || undefined,
    });
    a3.push({
      name: "repeated feedback is never cited as fact support",
      passed: claimEvidenceIds(repetition.proposal).every(
        (id) => !repetition.ids.feedback.includes(id),
      ),
    });
  }
  results.push({
    check: "repetition-is-not-authority",
    status: a3.every((x) => x.passed) ? "passed" : "failed",
    assertions: a3,
    humanReview: "pending",
  });

  const summary = {
    at: now(),
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    endpoint: GENAI_ENDPOINT,
    promptHash: AGENT_PROMPT_HASH,
    scope:
      "Local specialized runner; not Cloud Run latency. Mechanical assertions only; semantics pending human review.",
    results: results.map((r) => ({
      check: r.check,
      status: r.status,
      assertions: r.assertions,
    })),
    durationsMs: {
      control: control.durationMs,
      treatment: treatment.durationMs,
      dimensionBefore: before.durationMs,
      dimensionAfter: after.durationMs,
      repetition: repetition.durationMs,
    },
  };
  await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  await writeFile(`${out}/artifacts.json`, JSON.stringify(artifacts, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
