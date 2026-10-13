import { z } from "zod";
export const Fields = z.enum(["shortDescription", "imageCaption", "faq"]);
export type Field = z.infer<typeof Fields>;
export type PageContent = Record<Field, string>;
export const ClaimSchema = z
  .object({
    text: z.string().min(1).max(1200),
    evidenceIds: z.array(z.string().max(100)).min(1).max(6),
  })
  .strict();
export const ChangeSchema = z
  .object({
    field: Fields,
    value: z.string().min(1).max(3000),
    claims: z.array(ClaimSchema).min(1).max(12),
    issueIds: z.array(z.string()).min(1).max(10),
  })
  .strict();
export const IssueSchema = z
  .object({
    id: z.string().max(80),
    title: z.string().max(120),
    type: z.enum([
      "accessory",
      "unsupported_claim",
      "missing_info",
      "conflict",
      "quality",
      "fulfillment",
      "untrusted_input",
    ]),
    status: z.enum(["repairable", "needs_info", "conflict", "human_action"]),
    explanation: z.string().max(1200),
    evidenceIds: z.array(z.string()).max(8),
    question: z.string().max(400).optional(),
  })
  .strict();
export const ProposalSchema = z
  .object({
    issues: z.array(IssueSchema).max(20),
    changes: z.array(ChangeSchema).max(3),
  })
  .strict();
export type Proposal = z.infer<typeof ProposalSchema>;
export type Evidence = {
  id: string;
  sku: string;
  kind: "spec" | "feedback" | "image";
  label: string;
  text: string;
  revision: number;
  hash: string;
  confirmed: boolean;
  supersedes?: string;
  imageKey?: string;
  mimeType?: string;
  createdAt: string;
};
export type Patch = {
  id: string;
  runId: string;
  baseVersion: number;
  evidenceRevision: number;
  changes: Proposal["changes"];
  hash: string;
  status: "review_required" | "approved" | "stale" | "published";
  checks: string[];
  approval?: {
    sessionId: string;
    hash: string;
    baseVersion: number;
    evidenceRevision: number;
    expiresAt: number;
  };
  publishedVersion?: number;
};
export type Run = {
  id: string;
  parentId?: string;
  status: "running" | "completed" | "failed";
  phase: string;
  startedAt: string;
  deadline: number;
  executionId: string;
  baseVersion: number;
  evidenceRevision: number;
  events: { seq: number; phase: string; at: string }[];
  issues: Proposal["issues"];
  patchId?: string;
  error?: string;
  model: string;
  promptHash: string;
  calls: number;
  retries?: number;
  retryNotes?: string[];
  tools: number;
  usage: { input: number; output: number; estimatedUsd: number };
  durationMs?: number;
  validationNotes?: string[];
};
export type Verification = {
  id: string;
  version: number;
  evidenceRevision: number;
  status: "passed" | "failed";
  checks: { label: string; passed: boolean }[];
  unresolved: string[];
  createdAt: string;
};
export type Version = {
  version: number;
  content: PageContent;
  at: string;
  kind: "initial" | "publish" | "rollback";
  patchId?: string;
  restoredFrom?: number;
};
export type Session = {
  id: string;
  csrf: string;
  createdAt: string;
  expiresAt: number;
  sku: string;
  name: string;
  currentVersion: number;
  evidenceRevision: number;
  evidence: Evidence[];
  versions: Version[];
  patches: Patch[];
  runs: Run[];
  verifications: Verification[];
  commands: Record<string, { hash: string; version: number }>;
};
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function fail(code: string, status = 400): never {
  throw new DomainError(code, status);
}
