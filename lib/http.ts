import { NextRequest } from "next/server";
import { DomainError, fail } from "./types";
import { getSession, safeError } from "./domain";
import { store } from "./store";
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export function checkOrigin(req: NextRequest) {
  const expected = process.env.APP_ORIGIN || new URL(req.url).origin;
  if (req.headers.get("origin") !== expected) fail("ORIGIN_REJECTED", 403);
}
export async function auth(req: NextRequest, write = false) {
  const id = req.cookies.get("mr-session")?.value;
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) fail("SESSION_REQUIRED", 401);
  const s = await getSession(store(), id!);
  if (write) {
    checkOrigin(req);
    if (req.headers.get("x-csrf-token") !== s.csrf) fail("CSRF_REJECTED", 403);
  }
  return s;
}
export async function body(req: NextRequest) {
  if (Number(req.headers.get("content-length") || 0) > 64000)
    fail("BODY_TOO_LARGE", 413);
  const text = await req.text();
  if (Buffer.byteLength(text) > 64000) fail("BODY_TOO_LARGE", 413);
  try {
    return JSON.parse(text);
  } catch {
    return fail("INVALID_JSON");
  }
}
export function errorResponse(e: unknown) {
  if (!(e instanceof DomainError))
    console.error(
      JSON.stringify({
        event: "request_failed",
        error: e instanceof Error ? e.name : "Unknown",
      }),
    );
  return json(
    { error: safeError(e) },
    e instanceof DomainError ? e.status : 503,
  );
}
