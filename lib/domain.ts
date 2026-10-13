import { createHash, randomUUID, randomBytes } from "node:crypto";
import {
  ProposalSchema,
  DomainError,
  fail,
  type Session,
  type Evidence,
  type Patch,
  type Run,
  type Proposal,
  type Verification,
} from "./types";
import { products } from "./fixtures";
import type { Store } from "./store";
export const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const now = () => new Date().toISOString();
export const activeEvidence = (s: Session) =>
  s.evidence.filter((e) => !s.evidence.some((n) => n.supersedes === e.id));
export const page = (s: Session) =>
  s.versions.find((v) => v.version === s.currentVersion)!;
export function assertSession(s: Session | null): asserts s is Session {
  if (!s || s.expiresAt < Date.now()) fail("SESSION_EXPIRED", 401);
}
export function createEvidence(
  s: Session,
  kind: Evidence["kind"],
  label: string,
  text: string,
  confirmed = false,
): Evidence {
  return {
    id: randomUUID(),
    sku: s.sku,
    kind,
    label,
    text,
    revision: s.evidenceRevision,
    hash: hash(text),
    confirmed,
    createdAt: now(),
  };
}
export async function newSession(db: Store, sku = "commuter-one") {
  const p = products.find((p) => p.sku === sku) ?? fail("UNKNOWN_PRODUCT");
  const s: Session = {
    id: randomUUID(),
    csrf: randomBytes(24).toString("hex"),
    createdAt: now(),
    expiresAt: Date.now() + 86400000,
    sku: p.sku,
    name: p.name,
    currentVersion: 1,
    evidenceRevision: 1,
    evidence: [],
    versions: [{ version: 1, content: p.content, at: now(), kind: "initial" }],
    patches: [],
    runs: [],
    verifications: [],
    commands: {},
  };
  s.evidence.push(
    createEvidence(
      s,
      "spec",
      "Merchant specification · synthetic",
      p.spec,
      true,
    ),
  );
  p.feedback.forEach((t, i) =>
    s.evidence.push(
      createEvidence(
        s,
        "feedback",
        `Customer feedback ${i + 1} · synthetic`,
        t,
      ),
    ),
  );
  if (sku === "commuter-one")
    s.evidence.push({
      ...createEvidence(
        s,
        "image",
        "Product image · AI-generated demo",
        "AI-generated demonstration image. Only visible objects may be inferred.",
      ),
      imageKey: "fixture:commuter-one",
      mimeType: "image/png",
    });
  await db.transact<Session, void>("sessions", s.id, () => ({
    value: s,
    result: undefined,
  }));
  return s;
}
export async function mutate<R>(db: Store, id: string, fn: (s: Session) => R) {
  return db.transact<Session, R>("sessions", id, (s) => {
    assertSession(s);
    const result = fn(s);
    return { value: s, result };
  });
}
function invalidate(s: Session) {
  s.patches.forEach((p) => {
    if (p.status !== "published") {
      p.status = "stale";
      delete p.approval;
    }
  });
}
export async function addEvidence(
  db: Store,
  id: string,
  input: {
    kind: Evidence["kind"];
    label: string;
    text: string;
    confirmed?: boolean;
    supersedes?: string;
    imageKey?: string;
    mimeType?: string;
  },
) {
  return mutate(db, id, (s) => {
    if (s.evidence.length >= 60) fail("EVIDENCE_LIMIT", 429);
    if (input.kind === "spec" && !input.confirmed)
      fail("MERCHANT_CONFIRMATION_REQUIRED");
    const old = input.supersedes
      ? s.evidence.find((e) => e.id === input.supersedes)
      : null;
    if (
      input.supersedes &&
      (!old ||
        old.kind !== input.kind ||
        !activeEvidence(s).some((e) => e.id === old.id))
    )
      fail("INVALID_SOURCE_REPLACEMENT", 409);
    const active = activeEvidence(s);
    if (
      !old &&
      input.kind === "feedback" &&
      active.filter((e) => e.kind === "feedback").length >= 20
    )
      fail("FEEDBACK_LIMIT", 413);
    if (
      !old &&
      input.kind === "image" &&
      active.filter((e) => e.kind === "image").length >= 2
    )
      fail("IMAGE_LIMIT", 413);
    s.evidenceRevision++;
    invalidate(s);
    const e = {
      ...createEvidence(
        s,
        input.kind,
        input.label,
        input.text,
        !!input.confirmed,
      ),
      ...(input.supersedes ? { supersedes: input.supersedes } : {}),
      ...(input.imageKey
        ? { imageKey: input.imageKey, mimeType: input.mimeType }
        : {}),
    };
    s.evidence.push(e);
    return e;
  });
}
export function validateProposal(
  s: Session,
  raw: unknown,
): { proposal: Proposal; errors: string[] } {
  const result = ProposalSchema.safeParse(raw);
  if (!result.success) fail("INVALID_MODEL_OUTPUT", 422);
  const p = result.data,
    errors: string[] = [];
  const active = activeEvidence(s);
  const fields = new Set<string>();
  const issueIds = new Set(p.issues.map((i) => i.id));
  if (issueIds.size !== p.issues.length)
    errors.push("Duplicate issue identifiers");
  for (const issue of p.issues) {
    if (
      issue.evidenceIds.some(
        (id) => !active.some((e) => e.id === id && e.sku === s.sku),
      )
    )
      errors.push("Issue cites unavailable evidence");
  }
  for (const c of p.changes) {
    if (fields.has(c.field)) errors.push("Duplicate field");
    fields.add(c.field);
    if (/<\/?[a-z!]|javascript\s*:|data\s*:\s*text\/html/i.test(c.value))
      errors.push("Markup or executable content is prohibited");
    if (
      c.issueIds.some(
        (id) =>
          !issueIds.has(id) ||
          p.issues.find((i) => i.id === id)?.status !== "repairable",
      )
    )
      errors.push("Change must address a repairable issue");
    for (const claim of c.claims) {
      if (!c.value.includes(claim.text))
        errors.push(
          `Claim is not present verbatim in ${c.field}: ${claim.text}`,
        );
      for (const id of claim.evidenceIds) {
        const e = active.find((e) => e.id === id);
        if (!e || e.sku !== s.sku)
          errors.push("Source is missing, stale or belongs to another SKU");
        else if (e.kind === "feedback" || (e.kind === "spec" && !e.confirmed))
          errors.push("Customer feedback cannot establish product facts");
      }
    }
  }
  return { proposal: p, errors: [...new Set(errors)] };
}
export async function beginRun(db: Store, id: string, parentId?: string) {
  return mutate(db, id, (s) => {
    if (s.runs.some((r) => r.status === "running" && r.deadline > Date.now()))
      fail("RUN_ALREADY_ACTIVE", 409);
    s.runs
      .filter((r) => r.status === "running")
      .forEach((r) => {
        r.status = "failed";
        r.error = "Execution expired";
        r.phase = "Failed";
      });
    if (s.runs.length >= 12) fail("SESSION_RUN_LIMIT", 429);
    if (parentId && !s.runs.some((r) => r.id === parentId))
      fail("RUN_NOT_FOUND", 404);
    const r: Run = {
      id: randomUUID(),
      ...(parentId ? { parentId } : {}),
      status: "running",
      phase: "Reading evidence",
      startedAt: now(),
      deadline: Date.now() + 90000,
      executionId: randomUUID(),
      baseVersion: s.currentVersion,
      evidenceRevision: s.evidenceRevision,
      events: [],
      issues: [],
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      promptHash: "",
      calls: 0,
      tools: 0,
      usage: { input: 0, output: 0, estimatedUsd: 0 },
    };
    s.runs.push(r);
    return r;
  });
}
export async function runEvent(db: Store, id: string, run: Run, phase: string) {
  return mutate(db, id, (s) => {
    const r = s.runs.find((r) => r.id === run.id);
    if (
      !r ||
      r.status !== "running" ||
      r.executionId !== run.executionId ||
      r.deadline < Date.now()
    )
      fail("RUN_EXPIRED", 409);
    r.phase = phase;
    r.events.push({ seq: r.events.length + 1, phase, at: now() });
    return r.events.at(-1)!;
  });
}
export async function finishRun(
  db: Store,
  id: string,
  run: Run,
  proposal: Proposal,
  checks: string[],
  metrics: Pick<Run, "calls" | "tools" | "usage" | "promptHash">,
) {
  return mutate(db, id, (s) => {
    const r = s.runs.find((r) => r.id === run.id);
    if (
      !r ||
      r.executionId !== run.executionId ||
      r.status !== "running" ||
      r.deadline < Date.now()
    )
      fail("RUN_EXPIRED", 409);
    if (
      s.currentVersion !== r.baseVersion ||
      s.evidenceRevision !== r.evidenceRevision
    )
      fail("INPUT_CHANGED_REASSESS", 409);
    const validated = validateProposal(s, proposal);
    if (validated.errors.length) fail("PATCH_FAILED_VALIDATION", 422);
    Object.assign(r, metrics, {
      issues: proposal.issues,
      status: "completed",
      phase: proposal.changes.length ? "Ready for review" : "Review required",
      durationMs: Date.now() - Date.parse(r.startedAt),
    });
    if (proposal.changes.length) {
      const p: Patch = {
        id: randomUUID(),
        runId: r.id,
        baseVersion: r.baseVersion,
        evidenceRevision: r.evidenceRevision,
        changes: proposal.changes,
        hash: hash(proposal.changes),
        status: "review_required",
        checks,
      };
      s.patches.push(p);
      r.patchId = p.id;
    }
    return r;
  });
}
export async function failRun(
  db: Store,
  id: string,
  run: Run,
  message: string,
  metrics?: Partial<Run>,
) {
  return mutate(db, id, (s) => {
    const r = s.runs.find((r) => r.id === run.id);
    if (r && r.status === "running" && r.executionId === run.executionId)
      Object.assign(r, metrics, {
        status: "failed",
        phase: "Stopped",
        error: message,
        durationMs: Date.now() - Date.parse(r.startedAt),
      });
  });
}
function currentPatch(s: Session, id: string) {
  const p = s.patches.find((p) => p.id === id) ?? fail("PATCH_NOT_FOUND", 404);
  if (
    p.baseVersion !== s.currentVersion ||
    p.evidenceRevision !== s.evidenceRevision ||
    p.hash !== hash(p.changes) ||
    p.status === "stale"
  )
    fail("PATCH_STALE_REASSESS", 409);
  return p;
}
export async function approve(
  db: Store,
  id: string,
  patchId: string,
  expectedHash: string,
) {
  return mutate(db, id, (s) => {
    const p = currentPatch(s, patchId);
    if (p.hash !== expectedHash) fail("PATCH_HASH_MISMATCH", 409);
    if (!["review_required", "approved"].includes(p.status))
      fail("NOT_APPROVABLE", 409);
    p.approval = {
      sessionId: id,
      hash: p.hash,
      baseVersion: p.baseVersion,
      evidenceRevision: p.evidenceRevision,
      expiresAt: Date.now() + 600000,
    };
    p.status = "approved";
    return p;
  });
}
function command(s: Session, key: string, payload: unknown) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key)) fail("IDEMPOTENCY_KEY_REQUIRED");
  const existing = s.commands[key];
  if (existing && existing.hash !== hash(payload))
    fail("IDEMPOTENCY_KEY_REUSED", 409);
  return existing;
}
export async function publish(
  db: Store,
  id: string,
  patchId: string,
  key: string,
) {
  return mutate(db, id, (s) => {
    const payload = { type: "publish", patchId },
      old = command(s, key, payload);
    if (old) return { version: old.version, replayed: true };
    const p = currentPatch(s, patchId),
      a = p.approval;
    if (
      p.status !== "approved" ||
      !a ||
      a.sessionId !== id ||
      a.expiresAt < Date.now() ||
      a.hash !== p.hash ||
      a.baseVersion !== s.currentVersion ||
      a.evidenceRevision !== s.evidenceRevision
    )
      fail("VALID_APPROVAL_REQUIRED", 403);
    if (s.versions.length >= 40) fail("VERSION_LIMIT", 429);
    const content = { ...page(s).content };
    p.changes.forEach((c) => {
      content[c.field] = c.value;
    });
    const version = s.currentVersion + 1;
    invalidate(s);
    p.status = "published";
    p.approval = a;
    p.publishedVersion = version;
    s.versions.push({
      version,
      content,
      at: now(),
      kind: "publish",
      patchId: p.id,
    });
    s.currentVersion = version;
    s.commands[key] = { hash: hash(payload), version };
    return { version, replayed: false };
  });
}
export async function rollback(
  db: Store,
  id: string,
  target: number,
  baseVersion: number,
  key: string,
) {
  return mutate(db, id, (s) => {
    const payload = { type: "rollback", target, baseVersion },
      old = command(s, key, payload);
    if (old) return { version: old.version, replayed: true };
    if (s.currentVersion !== baseVersion) fail("VERSION_CONFLICT", 409);
    const source =
      s.versions.find((v) => v.version === target) ??
      fail("VERSION_NOT_FOUND", 404);
    if (s.versions.length >= 40) fail("VERSION_LIMIT", 429);
    const version = s.currentVersion + 1;
    s.versions.push({
      version,
      content: { ...source.content },
      at: now(),
      kind: "rollback",
      restoredFrom: target,
    });
    s.currentVersion = version;
    invalidate(s);
    s.commands[key] = { hash: hash(payload), version };
    return { version, replayed: false };
  });
}
export async function verify(
  db: Store,
  id: string,
  version: number,
  rendered: { version: number; content: unknown },
) {
  return mutate(db, id, (s) => {
    if (version !== s.currentVersion) fail("VERSION_CONFLICT", 409);
    const v = page(s);
    const p = s.patches.find((p) => p.id === v.patchId);
    const content = rendered.content as Record<string, unknown>;
    const checks = [
      {
        label: "Read the current storefront version",
        passed: rendered.version === version,
      },
      {
        label: "Served storefront content matches the persisted version",
        passed: hash(content) === hash(v.content),
      },
    ];
    if (p) {
      p.changes.forEach((c) =>
        checks.push({
          label: `Approved ${c.field} is visible`,
          passed: content[c.field] === c.value,
        }),
      );
      checks.push({
        label: "Evidence has not changed since approval",
        passed: p.evidenceRevision === s.evidenceRevision,
      });
    } else
      checks.push({
        label: "Restored page matches the selected historical version",
        passed:
          v.kind === "rollback" &&
          hash(v.content) ===
            hash(s.versions.find((x) => x.version === v.restoredFrom)?.content),
      });
    const r = p ? s.runs.find((r) => r.id === p.runId) : null;
    const unresolved = r
      ? r.issues.filter((i) => i.status !== "repairable").map((i) => i.title)
      : (s.runs
          .filter((r) => r.status === "completed")
          .at(-1)
          ?.issues.map((i) => "Reassess restored content: " + i.title) ?? []);
    const result: Verification = {
      id: randomUUID(),
      version,
      evidenceRevision: s.evidenceRevision,
      status: checks.every((c) => c.passed) ? "passed" : "failed",
      checks,
      unresolved,
      createdAt: now(),
    };
    if (s.verifications.length >= 40) s.verifications.shift();
    s.verifications.push(result);
    return result;
  });
}
export async function getSession(db: Store, id: string) {
  const s = await db.read<Session>("sessions", id);
  assertSession(s);
  if (s.runs.some((r) => r.status === "running" && r.deadline < Date.now())) {
    await mutate(db, id, (x) =>
      x.runs.forEach((r) => {
        if (r.status === "running" && r.deadline < Date.now()) {
          r.status = "failed";
          r.phase = "Stopped";
          r.error = "Execution expired. Start a new attempt.";
        }
      }),
    );
    return (await db.read<Session>("sessions", id))!;
  }
  return s;
}
export const safeError = (e: unknown) =>
  e instanceof DomainError
    ? e.code
    : e instanceof Error && /abort|timeout/i.test(e.message)
      ? "RUN_INTERRUPTED"
      : "SERVICE_UNAVAILABLE";

export async function importFeedback(
  db: Store,
  id: string,
  input: { sku: string; feedback: string[] },
) {
  return mutate(db, id, (s) => {
    if (input.sku !== s.sku) fail("PRODUCT_NOT_FOUND", 404);
    if (
      activeEvidence(s).filter((e) => e.kind === "feedback").length +
        input.feedback.length >
        20 ||
      s.evidence.length + input.feedback.length > 60
    )
      fail("FEEDBACK_LIMIT", 413);
    s.evidenceRevision++;
    invalidate(s);
    const added = input.feedback.map((text) =>
      createEvidence(s, "feedback", "Imported feedback · demo", text),
    );
    s.evidence.push(...added);
    return added;
  });
}
