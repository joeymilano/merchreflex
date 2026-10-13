import test from "node:test";
import assert from "node:assert/strict";
import {
  isTransientModelError,
  retryDecision,
  MAX_RETRIES_PER_RUN,
} from "../lib/agent";
import { DomainError } from "../lib/types";

function transient(status: number, message = "upstream unavailable") {
  return Object.assign(new Error(message), { status });
}

test("transient model errors are classified by status and message", () => {
  for (const status of [429, 500, 502, 503, 504])
    assert.equal(isTransientModelError(transient(status)), true, `status ${status}`);
  assert.equal(isTransientModelError(transient(400, "bad request")), false);
  assert.equal(
    isTransientModelError(new Error("model is currently overloaded, retry later")),
    true,
  );
  assert.equal(
    isTransientModelError(new Error("RESOURCE_EXHAUSTED: quota exceeded")),
    true,
  );
  assert.equal(isTransientModelError(new Error("plain failure")), false);
});

test("control-flow and abort errors are never retried", () => {
  assert.equal(isTransientModelError(new DomainError("SERVICE_UNAVAILABLE", 503)), false);
  assert.equal(isTransientModelError(new DomainError("MODEL_CALL_LIMIT", 429)), false);
  const abort = Object.assign(new Error("The operation was aborted"), {
    name: "AbortError",
  });
  assert.equal(isTransientModelError(abort), false);
  assert.equal(isTransientModelError("string error"), false);
  assert.equal(isTransientModelError(undefined), false);
});

test("retryDecision allows bounded, deadline-aware retries", () => {
  const base = {
    error: transient(503),
    now: 1_000_000,
    deadline: 1_000_000 + 60_000,
    signalAborted: false,
  };
  const first = retryDecision({ ...base, callRetries: 0, runRetries: 0 });
  assert.deepEqual(first, { retry: true, delayMs: 700 });
  const second = retryDecision({ ...base, callRetries: 0, runRetries: 1 });
  assert.deepEqual(second, { retry: true, delayMs: 1400 });
});

test("retryDecision refuses beyond caps, non-transient errors, aborts and thin deadlines", () => {
  const base = {
    error: transient(503),
    now: 1_000_000,
    deadline: 1_000_000 + 60_000,
    signalAborted: false,
  };
  assert.equal(
    retryDecision({ ...base, callRetries: 1, runRetries: 0 }).retry,
    false,
    "per-call cap",
  );
  assert.equal(
    retryDecision({ ...base, callRetries: 0, runRetries: MAX_RETRIES_PER_RUN }).retry,
    false,
    "per-run cap",
  );
  assert.equal(
    retryDecision({ ...base, error: new Error("fatal"), callRetries: 0, runRetries: 0 })
      .retry,
    false,
    "non-transient",
  );
  assert.equal(
    retryDecision({ ...base, signalAborted: true, callRetries: 0, runRetries: 0 }).retry,
    false,
    "aborted",
  );
  assert.equal(
    retryDecision({
      ...base,
      now: base.deadline - 15_000,
      callRetries: 0,
      runRetries: 0,
    }).retry,
    false,
    "not enough remaining time for a meaningful retry",
  );
});
