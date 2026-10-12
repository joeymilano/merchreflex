import { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";
import { store } from "@/lib/store";
import {
  newSession,
  addEvidence,
  importFeedback,
  beginRun,
  runEvent,
  finishRun,
  failRun,
  getSession,
  approve,
  publish,
  rollback,
  verify,
  hash,
  safeError,
  activeEvidence,
} from "@/lib/domain";
import { runAgent } from "@/lib/agent";
import { auth, body, checkOrigin, errorResponse, json } from "@/lib/http";
import { fail, DomainError } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const p = (await params).path;
    if (p[0] === "health")
      return json({
        ok: true,
        service: "merchreflex",
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        storage: process.env.STORAGE_DRIVER || "local",
        version: "0.1.0",
      });
    const s = await auth(req);
    if (p[0] === "session") return json(s);
    if (p[0] === "runs") {
      const r = s.runs.find((r) => r.id === p[1]) ?? fail("RUN_NOT_FOUND", 404);
      return json(r);
    }
    if (p[0] === "images") {
      const e =
        s.evidence.find((e) => e.id === p[1] && e.kind === "image") ??
        fail("IMAGE_NOT_FOUND", 404);
      let bytes: Buffer;
      if (e.imageKey === "fixture:commuter-one")
        bytes = await readFile(process.cwd() + "/public/commuter-one.png");
      else {
        if (!e.imageKey?.startsWith(s.id + "/")) fail("IMAGE_NOT_FOUND", 404);
        [bytes] = await new Storage()
          .bucket(process.env.EVIDENCE_BUCKET!)
          .file(e.imageKey!)
          .download();
      }
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": e.mimeType || "image/png",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    fail("NOT_FOUND", 404);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const p = (await params).path,
      db = store();
    if (p[0] === "sessions") {
      checkOrigin(req);
      const day = new Date().toISOString().slice(0, 10);
      await db.transact<{ count: number }, void>(
        "limits",
        "sessions-" + day,
        (v) => {
          v ??= { count: 0 };
          if (v.count >= 150) fail("DAILY_SESSION_LIMIT", 429);
          v.count++;
          return { value: v, result: undefined };
        },
      );
      const s = await newSession(db);
      const res = json(s, 201);
      res.headers.set(
        "Set-Cookie",
        `mr-session=${s.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${new URL(req.headers.get("origin")!).protocol === "https:" ? "; Secure" : ""}`,
      );
      return res;
    }
    const s = await auth(req, true);
    if (p[0] === "images") {
      if (
        Number(req.headers.get("content-length") || 0) >
        5 * 1024 * 1024 + 20000
      )
        fail("IMAGE_TOO_LARGE", 413);
      if (activeEvidence(s).filter((e) => e.kind === "image").length >= 2)
        fail("IMAGE_LIMIT", 413);
      const data = await req.formData();
      const file = data.get("file");
      if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
        fail("IMAGE_TOO_LARGE", 413);
      const input = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(input, {
        limitInputPixels: 16000000,
      }).metadata();
      if (!["png", "jpeg"].includes(metadata.format || ""))
        fail("PNG_OR_JPEG_REQUIRED", 415);
      const clean = await sharp(input, { limitInputPixels: 16000000 })
        .rotate()
        .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      if (!process.env.EVIDENCE_BUCKET)
        fail("IMAGE_STORAGE_NOT_CONFIGURED", 503);
      const key = `${s.id}/${randomUUID()}.png`;
      const object = new Storage()
        .bucket(process.env.EVIDENCE_BUCKET!)
        .file(key);
      await object.save(clean, { contentType: "image/png", resumable: false });
      try {
        const e = await addEvidence(db, s.id, {
          kind: "image",
          label: "Uploaded product image",
          text: "User-uploaded image. Visible appearance only, not proof of technical specifications.",
          imageKey: key,
          mimeType: "image/png",
        });
        return json(e, 201);
      } catch (e) {
        await object.delete().catch(() => {});
        throw e;
      }
    }
    const b = await body(req);
    if (p[0] === "evidence" && p[1] === "import") {
      const input = z
        .object({
          sku: z.string(),
          feedback: z.array(z.string().min(1).max(6000)).min(1).max(20),
        })
        .strict()
        .parse(b);
      return json(await importFeedback(db, s.id, input), 201);
    }
    if (p[0] === "evidence") {
      const input = z
        .object({
          kind: z.enum(["spec", "feedback"]),
          label: z.string().min(1).max(100),
          text: z.string().min(1).max(6000),
          confirmed: z.boolean().optional(),
          supersedes: z.string().uuid().optional(),
        })
        .strict()
        .parse(b);
      return json(await addEvidence(db, s.id, input), 201);
    }
    if (p[0] === "runs" && (!p[1] || p[2] === "reassess")) {
      z.object({}).strict().parse(b);
      const run = await beginRun(
        db,
        s.id,
        p[2] === "reassess" ? p[1] : undefined,
      );
      const snapshot = await getSession(db, s.id);
      const abort = new AbortController();
      req.signal.addEventListener("abort", () => abort.abort(), { once: true });
      const timer = setTimeout(
        () => abort.abort(),
        Math.max(1, run.deadline - Date.now()),
      );
      const encoder = new TextEncoder();
      let cancelled = false;
      const stream = new ReadableStream({
        async start(controller) {
          const send = (v: unknown) => {
            if (!cancelled)
              controller.enqueue(encoder.encode(JSON.stringify(v) + "\n"));
          };
          try {
            send({ type: "run", runId: run.id });
            const result = await runAgent(
              db,
              snapshot,
              run,
              abort.signal,
              async (phase) => {
                abort.signal.throwIfAborted();
                const event = await runEvent(db, s.id, run, phase);
                send({ type: "event", ...event });
              },
            );
            abort.signal.throwIfAborted();
            const finished = await finishRun(
              db,
              s.id,
              run,
              result.proposal,
              result.checks,
              result.metrics,
            );
            send({ type: "complete", run: finished });
            console.info(
              JSON.stringify({
                event: "run_completed",
                runId: run.id,
                durationMs: finished.durationMs,
                calls: finished.calls,
                tools: finished.tools,
                usage: finished.usage,
              }),
            );
          } catch (e) {
            const code = safeError(e);
            await failRun(
              db,
              s.id,
              run,
              code,
              (e as { metrics?: Partial<import("@/lib/types").Run> }).metrics,
            ).catch(() => {});
            console.error(
              JSON.stringify({
                event: "run_failed",
                runId: run.id,
                code,
                detail:
                  e instanceof Error ? e.message.slice(0, 350) : "Unknown",
              }),
            );
            send({ type: "error", error: code });
          } finally {
            clearTimeout(timer);
            if (!cancelled) controller.close();
          }
        },
        cancel() {
          cancelled = true;
          abort.abort();
          clearTimeout(timer);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }
    if (p[0] === "patches" && p[2] === "approve") {
      const input = z
        .object({ hash: z.string().length(64), factsReviewed: z.literal(true) })
        .strict()
        .parse(b);
      return json(await approve(db, s.id, p[1], input.hash));
    }
    if (p[0] === "patches" && p[2] === "publish") {
      z.object({}).strict().parse(b);
      return json(
        await publish(db, s.id, p[1], req.headers.get("idempotency-key") || ""),
      );
    }
    if (p[0] === "pages" && p[1] !== s.sku) fail("PRODUCT_NOT_FOUND", 404);
    if (p[0] === "pages" && p[2] === "rollback") {
      const input = z
        .object({
          targetVersion: z.number().int().positive(),
          baseVersion: z.number().int().positive(),
        })
        .strict()
        .parse(b);
      return json(
        await rollback(
          db,
          s.id,
          input.targetVersion,
          input.baseVersion,
          req.headers.get("idempotency-key") || "",
        ),
      );
    }
    if (p[0] === "pages" && p[2] === "verify") {
      const input = z
        .object({ version: z.number().int().positive() })
        .strict()
        .parse(b);
      const origin = process.env.APP_ORIGIN || new URL(req.url).origin;
      const response = await fetch(`${origin}/store/${s.sku}`, {
        headers: { cookie: `mr-session=${s.id}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) fail("STOREFRONT_READ_FAILED", 502);
      const html = await response.text();
      const match = html.match(
        /<script id="storefront-data" type="application\/json">([\s\S]*?)<\/script>/,
      );
      if (!match) fail("STOREFRONT_CONTENT_MISSING", 502);
      return json(await verify(db, s.id, input.version, JSON.parse(match[1])));
    }
    fail("NOT_FOUND", 404);
  } catch (e) {
    if (e instanceof z.ZodError)
      return json(
        {
          error: "INVALID_INPUT",
          issues: e.issues.map((i) => ({ path: i.path, message: i.message })),
        },
        422,
      );
    return errorResponse(e);
  }
}
