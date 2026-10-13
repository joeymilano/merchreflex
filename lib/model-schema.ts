import { z } from "zod";
import { ProposalSchema } from "./types";
// Keep one source schema. Express size constraints as generation hints because the
// Vertex decoder rejects this deeply nested schema with all numeric bounds intact.
// The unmodified strict Zod schema enforces every bound before review/publication.
function compatible(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(compatible);
  if (!node || typeof node !== "object") return node;
  const n = node as Record<string, unknown>,
    out: Record<string, unknown> = {};
  const allowed = new Set([
    "type",
    "enum",
    "required",
    "items",
    "additionalProperties",
    "description",
  ]);
  for (const [key, value] of Object.entries(n)) {
    if (key === "properties")
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          compatible(v),
        ]),
      );
    else if (allowed.has(key)) out[key] = compatible(value);
  }
  const hints = ["minLength", "maxLength", "minItems", "maxItems"]
    .filter((k) => k in n)
    .map((k) => `${k}=${n[k]}`);
  if (hints.length)
    out.description = [out.description, ...hints].filter(Boolean).join("; ");
  return out;
}
export const MODEL_SCHEMA = compatible(
  z.toJSONSchema(ProposalSchema),
) as Record<string, unknown>;
