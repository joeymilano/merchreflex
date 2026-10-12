import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const smokeId = process.env.SMOKE_ID || "latest";
const origin = process.env.TEST_ORIGIN || "http://localhost:3147";
const newSession = async () => {
  const r = await fetch(origin + "/api/sessions", {
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(r.status, 201);
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    s: await r.json(),
  };
};
async function main() {
  const { cookie, s } = await newSession();
  const headers = {
    cookie,
    Origin: origin,
    "Content-Type": "application/json",
    "x-csrf-token": s.csrf,
  };
  const post = async (path, body = {}, extras = {}) => {
    const r = await fetch(origin + "/api/" + path, {
      method: "POST",
      headers: { ...headers, ...extras },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await fetch(origin + "/api/session")).status, 401);
  assert.equal(
    (await post("evidence", {}, { Origin: "https://invalid.example" })).status,
    403,
  );
  assert.equal(
    (await post("evidence", {}, { "x-csrf-token": "invalid" })).status,
    403,
  );
  const before = Date.now();
  const r = await fetch(origin + "/api/runs", {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(r.status, 200);
  const events = (await r.text())
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x));
  console.log(
    JSON.stringify({
      events: events.map((e) => e.phase || e.type),
      durationMs: Date.now() - before,
    }),
  );
  const latest = await (
    await fetch(origin + "/api/session", { headers: { cookie } })
  ).json();
  await mkdir("output", { recursive: true });
  await writeFile(
    `output/api-smoke-${smokeId}.json`,
    JSON.stringify(
      { origin, at: new Date().toISOString(), events, session: latest },
      null,
      2,
    ),
  );
  assert.equal(
    latest.runs.at(-1).status,
    "completed",
    latest.runs.at(-1).error,
  );
  const patch = latest.patches.at(-1);
  assert.ok(patch);
  const foreign = await newSession();
  assert.equal(
    (
      await fetch(origin + `/api/patches/${patch.id}/approve`, {
        method: "POST",
        headers: {
          cookie: foreign.cookie,
          Origin: origin,
          "Content-Type": "application/json",
          "x-csrf-token": foreign.s.csrf,
        },
        body: JSON.stringify({ hash: patch.hash, factsReviewed: true }),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await post(
        `patches/${patch.id}/publish`,
        {},
        { "idempotency-key": "test-unapproved" },
      )
    ).status,
    403,
  );
  // This synthetic integration test audits mechanics, not human semantic approval. The test actor owns this isolated session.
  assert.equal(
    (
      await post(`patches/${patch.id}/approve`, {
        hash: patch.hash,
        factsReviewed: true,
      })
    ).status,
    200,
  );
  const pub = await post(
    `patches/${patch.id}/publish`,
    {},
    { "idempotency-key": "test-publication" },
  );
  assert.equal(pub.status, 200);
  assert.equal(pub.body.version, 2);
  const repeat = await post(
    `patches/${patch.id}/publish`,
    {},
    { "idempotency-key": "test-publication" },
  );
  assert.equal(repeat.body.replayed, true);
  const verify = await post(`pages/${s.sku}/verify`, { version: 2 });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  assert.equal(verify.body.status, "passed", JSON.stringify(verify.body));
  const rolled = await post(
    `pages/${s.sku}/rollback`,
    { targetVersion: 1, baseVersion: 2 },
    { "idempotency-key": "test-rollback" },
  );
  assert.equal(rolled.status, 200);
  assert.equal(rolled.body.version, 3);
  const verifiedRestore = await post(`pages/${s.sku}/verify`, { version: 3 });
  assert.equal(verifiedRestore.body.status, "passed");
  console.log(
    JSON.stringify({
      result: "pass",
      origin,
      durationMs: Date.now() - before,
      publicationVersion: 2,
      restoredVersion: 3,
    }),
  );
  await writeFile(
    `output/api-smoke-result-${smokeId}.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        origin,
        status: "passed",
        durationMs: Date.now() - before,
        checks: [
          "unauthenticated read denied",
          "Origin enforced",
          "CSRF enforced",
          "live agent completed",
          "session isolation",
          "unapproved publish denied",
          "approved publish",
          "idempotent replay",
          "served page verified",
          "rollback",
          "restored page verified",
        ],
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
