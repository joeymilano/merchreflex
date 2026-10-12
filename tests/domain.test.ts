import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../lib/store";
import {
  newSession,
  beginRun,
  finishRun,
  approve,
  publish,
  rollback,
  addEvidence,
  getSession,
  validateProposal,
  verify,
  hash,
  mutate,
  page,
  failRun,
  activeEvidence,
  importFeedback,
} from "../lib/domain";
import type { Proposal, Session, Run } from "../lib/types";
async function fixture() {
  const db = new MemoryStore(),
    s = await newSession(db),
    run = await beginRun(db, s.id);
  const spec = s.evidence.find((e) => e.kind === "spec")!;
  const proposal: Proposal = {
    issues: [
      {
        id: "included",
        title: "Bottle not included",
        type: "accessory",
        status: "repairable",
        explanation: "Photo has no contents clarification.",
        evidenceIds: [spec.id],
      },
    ],
    changes: [
      {
        field: "imageCaption",
        value: "Backpack only. Bottle not included.",
        claims: [
          {
            text: "Backpack only. Bottle not included.",
            evidenceIds: [spec.id],
          },
        ],
        issueIds: ["included"],
      },
    ],
  };
  return { db, s, run, proposal };
}
async function ready() {
  const f = await fixture();
  await finishRun(f.db, f.s.id, f.run, f.proposal, ["Source checked"], {
    calls: 2,
    tools: 1,
    usage: { input: 100, output: 50, estimatedUsd: 0.001 },
    promptHash: "test",
  });
  const s = await getSession(f.db, f.s.id);
  return { ...f, patch: s.patches[0] };
}
test("approval, publish, verified served content, and append-only rollback", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  const out = await publish(db, s.id, patch.id, "publish-001");
  assert.equal(out.version, 2);
  let next = await getSession(db, s.id);
  assert.equal(
    page(next).content.imageCaption,
    "Backpack only. Bottle not included.",
  );
  assert.equal(
    (await verify(db, s.id, 2, { version: 2, content: page(next).content }))
      .status,
    "passed",
  );
  await rollback(db, s.id, 1, 2, "rollback-001");
  next = await getSession(db, s.id);
  assert.equal(next.versions.length, 3);
  assert.equal(next.currentVersion, 3);
  assert.deepEqual(page(next).content, s.versions[0].content);
  assert.equal(next.versions[1].version, 2);
});
test("foreign session cannot read or approve another session patch", async () => {
  const { db, patch } = await ready();
  const other = await newSession(db);
  await assert.rejects(
    () => approve(db, other.id, patch.id, patch.hash),
    /PATCH_NOT_FOUND/,
  );
});
test("cross-SKU evidence is rejected", async () => {
  const { s, proposal } = await fixture();
  s.evidence[0].sku = "travel-mug";
  assert.ok(
    validateProposal(s, proposal).errors.some((e) => e.includes("SKU")),
  );
});
test("superseded evidence cannot support a patch", async () => {
  const { db, s, proposal } = await fixture();
  await addEvidence(db, s.id, {
    kind: "spec",
    label: "New specification",
    text: "Bottle included",
    confirmed: true,
    supersedes: s.evidence[0].id,
  });
  const current = await getSession(db, s.id);
  assert.ok(
    validateProposal(current, proposal).errors.some((e) => e.includes("stale")),
  );
});
test("dangerous fields and unknown schema properties are rejected", async () => {
  const { s, proposal } = await fixture();
  for (const field of [
    "price",
    "inventory",
    "warranty",
    "returnPolicy",
    "certification",
  ])
    assert.throws(
      () =>
        validateProposal(s, {
          ...proposal,
          changes: [{ ...proposal.changes[0], field }],
        }),
      /INVALID_MODEL_OUTPUT/,
    );
  assert.throws(
    () => validateProposal(s, { ...proposal, admin: true }),
    /INVALID_MODEL_OUTPUT/,
  );
});
test("HTML and script payloads cannot be published as content", async () => {
  const { s, proposal } = await fixture();
  for (const text of [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
  ]) {
    proposal.changes[0].value = text;
    proposal.changes[0].claims[0].text = text;
    assert.ok(
      validateProposal(s, proposal).errors.some((e) => e.includes("Markup")),
    );
  }
});
test("publish without approval is denied", async () => {
  const { db, s, patch } = await ready();
  await assert.rejects(
    () => publish(db, s.id, patch.id, "publish-001"),
    /VALID_APPROVAL_REQUIRED/,
  );
});
test("tampering after approval invalidates the fingerprint", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await mutate(
    db,
    s.id,
    (s) => (s.patches[0].changes[0].value = "Bottle included"),
  );
  await assert.rejects(
    () => publish(db, s.id, patch.id, "publish-001"),
    /PATCH_STALE/,
  );
});
test("changing evidence invalidates all outstanding approvals", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await addEvidence(db, s.id, {
    kind: "spec",
    label: "Supplement",
    text: "Sleeve 32 x 23 x 3 cm",
    confirmed: true,
  });
  const next = await getSession(db, s.id);
  assert.equal(next.patches[0].status, "stale");
  assert.equal(next.patches[0].approval, undefined);
  await assert.rejects(
    () => publish(db, s.id, patch.id, "publish-001"),
    /PATCH_STALE/,
  );
});
test("concurrent repeated publish has exactly one new version", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  const result = await Promise.all(
    Array.from({ length: 6 }, () => publish(db, s.id, patch.id, "publish-001")),
  );
  assert.equal(result.filter((r) => !r.replayed).length, 1);
  assert.equal((await getSession(db, s.id)).versions.length, 2);
});
test("idempotency keys cannot be reused for different commands", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await publish(db, s.id, patch.id, "shared-001");
  await assert.rejects(
    () => rollback(db, s.id, 1, 2, "shared-001"),
    /IDEMPOTENCY_KEY_REUSED/,
  );
});
test("stale rollback and concurrent different patches cannot overwrite", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await publish(db, s.id, patch.id, "publish-001");
  await assert.rejects(
    () => rollback(db, s.id, 1, 1, "rollback-001"),
    /VERSION_CONFLICT/,
  );
  await assert.rejects(
    () => publish(db, s.id, patch.id, "publish-002"),
    /PATCH_STALE/,
  );
});
test("expired approval cannot publish", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await mutate(db, s.id, (s) => {
    s.patches[0].approval!.expiresAt = Date.now() - 1;
  });
  await assert.rejects(
    () => publish(db, s.id, patch.id, "publish-001"),
    /VALID_APPROVAL_REQUIRED/,
  );
});
test("interrupted or expired runs cannot produce approvable patches", async () => {
  for (const mode of ["failed", "expired"]) {
    const { db, s, run, proposal } = await fixture();
    if (mode === "failed") await failRun(db, s.id, run, "Interrupted");
    else
      await mutate(db, s.id, (s) => {
        s.runs[0].deadline = Date.now() - 1;
      });
    await assert.rejects(
      () =>
        finishRun(db, s.id, run, proposal, [], {
          calls: 1,
          tools: 0,
          usage: { input: 1, output: 1, estimatedUsd: 0 },
          promptHash: "test",
        }),
      /RUN_EXPIRED/,
    );
    assert.equal((await getSession(db, s.id)).patches.length, 0);
  }
});
test("modified evidence during a run requires reassessment", async () => {
  const { db, s, run, proposal } = await fixture();
  await addEvidence(db, s.id, {
    kind: "feedback",
    label: "New feedback",
    text: "A different question",
  });
  await assert.rejects(
    () =>
      finishRun(db, s.id, run, proposal, [], {
        calls: 1,
        tools: 0,
        usage: { input: 1, output: 1, estimatedUsd: 0 },
        promptHash: "test",
      }),
    /INPUT_CHANGED/,
  );
});
test("reviews cannot establish facts, and quality complaints are not page repairs", async () => {
  const { s, proposal } = await fixture();
  proposal.changes[0].claims[0].evidenceIds = [
    s.evidence.find((e) => e.kind === "feedback")!.id,
  ];
  assert.ok(
    validateProposal(s, proposal).errors.some((e) =>
      e.includes("Customer feedback"),
    ),
  );
  proposal.issues[0].status = "human_action";
  assert.ok(
    validateProposal(s, proposal).errors.some((e) => e.includes("repairable")),
  );
});
test("source changes invalidate previous verification results", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await publish(db, s.id, patch.id, "publish-001");
  await addEvidence(db, s.id, {
    kind: "spec",
    label: "New",
    text: "Bottle included in new pack",
    confirmed: true,
    supersedes: s.evidence[0].id,
  });
  const next = await getSession(db, s.id);
  assert.equal(
    (await verify(db, s.id, 2, { version: 2, content: page(next).content }))
      .status,
    "failed",
  );
});
test("serving stale or wrong contents fails verification", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await publish(db, s.id, patch.id, "publish-001");
  assert.equal(
    (await verify(db, s.id, 2, { version: 1, content: s.versions[0].content }))
      .status,
    "failed",
  );
});
test("new evidence is immutable and old revisions remain inspectable", async () => {
  const { db, s } = await fixture();
  await addEvidence(db, s.id, {
    kind: "spec",
    label: "Replacement",
    text: "Bottle included.",
    confirmed: true,
    supersedes: s.evidence[0].id,
  });
  const next = await getSession(db, s.id);
  assert.equal(next.evidence[0].text, s.evidence[0].text);
  assert.ok(!activeEvidence(next).some((e) => e.id === s.evidence[0].id));
});
test("expired sessions and second active runs are rejected", async () => {
  const { db, s } = await fixture();
  await assert.rejects(() => beginRun(db, s.id), /RUN_ALREADY_ACTIVE/);
  await mutate(db, s.id, (s) => {
    s.expiresAt = 1;
  });
  await assert.rejects(() => getSession(db, s.id), /SESSION_EXPIRED/);
});

test("JSON feedback import is atomic and bounded", async () => {
  const { db, s } = await fixture();
  await assert.rejects(
    () =>
      importFeedback(db, s.id, { sku: "desk-light", feedback: ["Question"] }),
    /PRODUCT_NOT_FOUND/,
  );
  await assert.rejects(
    () =>
      importFeedback(db, s.id, {
        sku: s.sku,
        feedback: Array(16).fill("Question"),
      }),
    /FEEDBACK_LIMIT/,
  );
  assert.equal((await getSession(db, s.id)).evidence.length, s.evidence.length);
  await importFeedback(db, s.id, { sku: s.sku, feedback: ["One", "Two"] });
  const next = await getSession(db, s.id);
  assert.equal(next.evidence.length, s.evidence.length + 2);
  assert.equal(next.evidenceRevision, 2);
});
test("concurrent images cannot exceed the per-session limit", async () => {
  const { db, s } = await fixture();
  const results = await Promise.allSettled(
    ["a", "b"].map((label) =>
      addEvidence(db, s.id, { kind: "image", label, text: "Visible objects" }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    activeEvidence(await getSession(db, s.id)).filter((e) => e.kind === "image")
      .length,
    2,
  );
});

test("rollback verifies restoration without claiming old problems are solved", async () => {
  const { db, s, patch } = await ready();
  await approve(db, s.id, patch.id, patch.hash);
  await publish(db, s.id, patch.id, "pub-restore-test");
  await rollback(db, s.id, 1, 2, "restore-test-key");
  const current = await getSession(db, s.id);
  const result = await verify(db, s.id, 3, {
    version: 3,
    content: page(current).content,
  });
  assert.equal(result.status, "passed");
  assert.ok(result.unresolved.some((i) => i.includes("Bottle not included")));
});
