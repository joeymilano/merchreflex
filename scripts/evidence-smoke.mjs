import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const origin = process.env.TEST_ORIGIN;
if (!origin) throw new Error("TEST_ORIGIN required");
const r = await fetch(origin + "/api/sessions", {
    method: "POST",
    headers: { Origin: origin },
  }),
  s = await r.json(),
  cookie = r.headers.get("set-cookie").split(";")[0];
const headers = {
  cookie,
  Origin: origin,
  "Content-Type": "application/json",
  "x-csrf-token": s.csrf,
};
async function post(path, data = {}, extra = {}) {
  const r = await fetch(origin + "/api/" + path, {
    method: "POST",
    headers: { ...headers, ...extra },
    body: JSON.stringify(data),
  });
  return { status: r.status, body: await r.json() };
}
async function current() {
  return (await fetch(origin + "/api/session", { headers: { cookie } })).json();
}
async function audit(parent) {
  const r = await fetch(
    origin + "/api/" + (parent ? `runs/${parent}/reassess` : "runs"),
    { method: "POST", headers, body: "{}" },
  );
  const text = await r.text();
  const state = await current();
  assert.equal(state.runs.at(-1).status, "completed", text);
  return state;
}
const before = await audit();
const p = before.patches.at(-1);
assert.ok(p);
assert.equal(
  (await post(`patches/${p.id}/approve`, { hash: p.hash, factsReviewed: true }))
    .status,
  200,
);
const old = s.evidence.find((e) => e.kind === "spec");
const changed = old.text.replace(
  "Package contains one backpack only. The water bottle shown is a styling prop and is NOT included.",
  "Package contains one backpack and the water bottle shown. This updated bundle includes the water bottle.",
);
assert.equal(
  (
    await post("evidence", {
      kind: "spec",
      label: "Updated bundle · synthetic",
      text: changed,
      confirmed: true,
      supersedes: old.id,
    })
  ).status,
  201,
);
assert.equal(
  (
    await post(
      `patches/${p.id}/publish`,
      {},
      { "idempotency-key": "stale-source-publish" },
    )
  ).status,
  409,
);
const after = await audit(before.runs.at(-1).id);
assert.equal(after.runs.at(-1).parentId, before.runs.at(-1).id);
assert.equal(after.patches.find((x) => x.id === p.id).status, "stale");
assert.ok(after.evidence.some((e) => e.id === old.id && e.text === old.text));
const newPatch = after.patches.at(-1);
assert.ok(
  newPatch.changes.some(
    (c) =>
      /bottle/i.test(c.value) && /includ|contains|comes with/i.test(c.value),
  ),
);
assert.ok(
  !newPatch.changes.some((c) =>
    /bottle.{0,45}(not included|excluded)/i.test(c.value),
  ),
);
assert.ok(
  newPatch.changes.every((c) =>
    c.claims.every((cl) => !cl.evidenceIds.includes(old.id)),
  ),
);
const payload = {
  at: new Date().toISOString(),
  checks: [
    "changed merchant source creates new evidence",
    "old approval is rejected with 409",
    "reassessment links old and new runs",
    "old evidence remains immutable",
    "bundle correction changes with source",
  ],
  before: { issues: before.runs.at(-1).issues, changes: p.changes },
  after: { issues: after.runs.at(-1).issues, changes: newPatch.changes },
  status: "passed",
  humanReview:
    "Automation checks expected phrases and source links; not independent semantic grading.",
};
await writeFile(
  "output/evidence-smoke-result.json",
  JSON.stringify(payload, null, 2),
);
const form = new FormData();
form.append(
  "file",
  new Blob([await readFile("public/commuter-one.png")], { type: "image/png" }),
  "fixture.png",
);
const uploaded = await fetch(origin + "/api/images", {
  method: "POST",
  headers: { cookie, Origin: origin, "x-csrf-token": s.csrf },
  body: form,
});
assert.equal(uploaded.status, 201);
const e = await uploaded.json();
assert.equal(
  (await fetch(origin + "/api/images/" + e.id, { headers: { cookie } })).status,
  200,
);
assert.equal((await fetch(origin + "/api/images/" + e.id)).status, 401);
assert.equal(
  (await post("pages/other-sku/verify", { version: 1 })).status,
  404,
);
console.log(
  JSON.stringify({
    status: "passed",
    ...payload,
    upload: "private normalized image uploaded and retrieved",
    crossSku: "denied",
  }),
);
