"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
  AlertTriangle,
  Image as ImageIcon,
  Upload,
  Search,
  CheckCheck,
  ClipboardCheck,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import type { Session, Evidence, IssueSchema, Field } from "@/lib/types";
const fieldNames: Record<Field, string> = {
  shortDescription: "Product description",
  imageCaption: "Image caption",
  faq: "Frequently asked questions",
};
const steps = [
  "Start a mission",
  "Inspect evidence",
  "Review changes",
  "Live & history",
];
const statusNames: Record<string, string> = {
  repairable: "Ready to repair",
  needs_info: "Needs information",
  conflict: "Evidence conflict",
  human_action: "Human action",
  review_required: "Ready for review",
  approved: "Approved",
  stale: "Outdated · reassess",
  published: "Published",
};
const messages: Record<string, string> = {
  SESSION_RUN_LIMIT: "This demo session has reached its 12-run limit.",
  DAILY_CAPACITY_REACHED:
    "Today’s live demo capacity has been reached. Please return tomorrow.",
  MODEL_BUDGET_REACHED:
    "The live model budget has been reached. Existing results and page history remain available.",
  PATCH_STALE_REASSESS:
    "The page or evidence changed. Reassess and approve a new patch.",
  SEMANTIC_CHECK_FAILED_REVIEW_REQUIRED:
    "The proposed wording did not pass the independent check. No page changes were published.",
  INPUT_CHANGED_REASSESS:
    "Evidence changed during this run. Start a new assessment.",
  RUN_INTERRUPTED:
    "This run was interrupted. Nothing was published. Please retry.",
  SERVICE_UNAVAILABLE:
    "The service could not complete this request. No change has been confirmed. Please retry.",
  ORIGIN_REJECTED:
    "This address is not configured for changes. Please use the official application URL.",
};
export default function Workbench() {
  const [session, setSession] = useState<Session | null>(null),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [source, setSource] = useState<Evidence | null>(null),
    [editing, setEditing] = useState(false),
    [spec, setSpec] = useState(""),
    [feedback, setFeedback] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [activity, setActivity] = useState<string[]>([]),
    [selectedIssue, setSelectedIssue] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!source && !editing) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = drawerRef.current;
    el?.querySelector<HTMLButtonElement>("button")?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSource(null);
        setEditing(false);
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      );
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [source, editing]);
  const importRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null),
    abortRef = useRef<AbortController | null>(null);
  const run = session?.runs.at(-1),
    patch = session?.patches.find((p) => p.id === run?.patchId),
    version = session?.versions.find(
      (v) => v.version === session.currentVersion,
    ),
    evidence =
      session?.evidence.filter(
        (e) => !session.evidence.some((n) => n.supersedes === e.id),
      ) ?? [],
    verification = session?.verifications
      .filter(
        (v) =>
          v.version === session.currentVersion &&
          v.evidenceRevision === session.evidenceRevision,
      )
      .at(-1);
  const request = async (
    path: string,
    data?: unknown,
    extra: Record<string, string> = {},
  ) => {
    const response = await fetch("/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data !== undefined
          ? {
              "Content-Type": "application/json",
              "x-csrf-token": session?.csrf || "",
            }
          : {}),
        ...extra,
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    const out = await response.json();
    if (!response.ok) throw new Error(out.error || "SERVICE_UNAVAILABLE");
    return out;
  };
  const refresh = async () => {
    const s = await request("session");
    setSession(s);
    return s as Session;
  };
  useEffect(() => {
    fetch("/api/session")
      .then(async (r) => {
        if (r.ok) {
          const s = await r.json();
          setSession(s);
          if (s.runs.length) setStep(s.runs.at(-1).patchId ? 2 : 1);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => {
    if (!run || run.status !== "running" || busy) return;
    const timer = setInterval(() => {
      fetch("/api/session")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (s) setSession(s);
        });
    }, 2500);
    return () => clearInterval(timer);
  }, [run?.status, busy]);
  const action = async (fn: () => Promise<void>) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const code = e instanceof Error ? e.message : "SERVICE_UNAVAILABLE";
      setError(messages[code] || code.replaceAll("_", " ").toLowerCase());
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    action(async () => {
      const s = await request("sessions", {});
      setSession(s);
      setStep(0);
      setActivity([]);
      setReviewed(false);
    });
  const audit = () =>
    action(async () => {
      if (!session) return;
      setStep(1);
      setActivity([]);
      setReviewed(false);
      setPhase("Reading evidence");
      const abort = new AbortController();
      abortRef.current = abort;
      const response = await fetch(
        "/api/" + (run ? `runs/${run.id}/reassess` : "runs"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": session.csrf,
          },
          body: "{}",
          signal: abort.signal,
        },
      );
      if (!response.ok) {
        const b = await response.json();
        throw new Error(b.error);
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        runError = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.phase) {
              setPhase(event.phase);
              setActivity((a) => [...a, event.phase]);
            }
            if (event.type === "error") runError = event.error;
          }
        }
      } finally {
        abortRef.current = null;
        await refresh();
        setPhase("");
      }
      if (runError) throw new Error(runError);
    });
  const saveEvidence = () =>
    action(async () => {
      if (editing) {
        const current = evidence.find((e) => e.kind === "spec");
        await request("evidence", {
          kind: "spec",
          label: "Merchant specification · synthetic",
          text: spec,
          confirmed,
          supersedes: current?.id,
        });
        setEditing(false);
        setConfirmed(false);
        setNotice(
          "Specification updated. Previous approvals are no longer valid. Reassess to create new changes.",
        );
      } else {
        await request("evidence", {
          kind: "feedback",
          label: "Added customer feedback · demo",
          text: feedback,
        });
        setFeedback("");
        setNotice("Feedback added. Reassess to include it.");
      }
      await refresh();
      setReviewed(false);
    });
  const openSpec = () => {
    setSpec(evidence.find((e) => e.kind === "spec")?.text || "");
    setEditing(true);
    setConfirmed(false);
    setSource(null);
  };
  const importJson = (file: File) =>
    action(async () => {
      if (file.size > 20000)
        throw new Error("JSON file must be smaller than 20 KB.");
      const data = JSON.parse(await file.text());
      if (
        !data ||
        Object.keys(data).some((k) => !["sku", "feedback"].includes(k)) ||
        data.sku !== session?.sku ||
        !Array.isArray(data.feedback) ||
        data.feedback.length < 1 ||
        data.feedback.some(
          (x: unknown) => typeof x !== "string" || !x.trim() || x.length > 6000,
        ) ||
        data.feedback.length +
          evidence.filter((e) => e.kind === "feedback").length >
          20
      )
        throw new Error(
          'Use {"sku":"commuter-one","feedback":["..."]}; at most 20 total feedback items.',
        );
      await request("evidence/import", data);
      await refresh();
      setNotice("Feedback imported. Reassess to include it.");
    });
  const upload = (file: File) =>
    action(async () => {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "x-csrf-token": session?.csrf || "" },
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      setNotice(
        "Image stored privately and added as evidence. Reassess to inspect it.",
      );
    });
  const publishPatch = () =>
    action(async () => {
      if (!patch) return;
      await request(`patches/${patch.id}/approve`, {
        hash: patch.hash,
        factsReviewed: reviewed,
      });
      await request(
        `patches/${patch.id}/publish`,
        {},
        { "idempotency-key": `publish-${patch.id}` },
      );
      await refresh();
      setStep(3);
      setNotice(
        "New page version published. Run the storefront check to verify the result.",
      );
      setReviewed(false);
    });
  return (
    <div className="app-shell">
      <aside className="rail">
        <a href="/" className="wordmark">
          <span className="brand-icon">
            <Layers3 size={21} />
          </span>
          MerchReflex
        </a>
        <div className="workspace-label">
          YOUR WORKSPACE <span>DEMO</span>
        </div>
        <nav aria-label="Workflow">
          {steps.map((label, i) => {
            const Icon = [Plus, Search, ClipboardCheck, History][i];
            return (
              <button
                key={label}
                className={"nav-item " + (step === i ? "active" : "")}
                disabled={!session && i !== 0}
                onClick={() => setStep(i)}
              >
                <Icon size={18} />
                {label}
                <span className="step-number">0{i + 1}</span>
              </button>
            );
          })}
        </nav>
        <div className="rail-divider" />
        <div className="rail-note">
          <ShieldCheck size={19} />
          <strong>Your store. Your call.</strong>
          <p>
            Every change needs your approval. Every published version can be
            restored.
          </p>
        </div>
        <div className="rail-bottom">
          <span className="avatar">FG</span>
          <div>
            Finfold Growth Lab<small>AI Builder Cup 2026</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={13} /> {steps[step]}
          </span>
          <div>
            <span className="dot" /> Isolated demo{" "}
            <span className="top-divider" /> Powered by Gemini
          </div>
        </header>
        <main>
          <div className="demo-note">
            <span>
              <ShieldCheck size={14} /> Synthetic product & feedback ·
              AI-generated image
            </span>
            <span>No production store is connected.</span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert notice" role="status">
              <Check size={18} />
              <span>{notice}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {step === 0 && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    PRODUCT PAGE MAINTENANCE, WITH PROOF
                  </div>
                  <h1>
                    Fix the page.
                    <br />
                    <span>Not just the ticket.</span>
                  </h1>
                  <p>
                    Turn customer confusion into precise, evidence-backed
                    changes.
                    <br className="desktop" /> Review the difference. Publish
                    with confidence. Keep control.
                  </p>
                </div>
                <span className="edition">
                  MERCHREFLEX
                  <br />
                  FIELD NOTES — 001
                </span>
              </div>
              <div className="mission-grid">
                <section className="mission-card">
                  <div className="section-top">
                    <span className="eyebrow">01 / THE MISSION</span>
                    <span className="tag">One product. One clear task.</span>
                  </div>
                  <h2>
                    A familiar product.
                    <br />
                    An avoidable misunderstanding.
                  </h2>
                  <blockquote>
                    “I thought the bottle in the photo
                    <br />
                    was included.”
                    <span>Customer feedback · synthetic scenario</span>
                  </blockquote>
                  <p className="muted">
                    The page promises waterproof protection. The product
                    specification tells a different story. Let’s find what can
                    actually be fixed.
                  </p>
                  <div className="input-summary">
                    <span>
                      <MessageSquare size={16} />
                      {evidence.filter((e) => e.kind === "feedback").length ||
                        5}{" "}
                      feedback items
                    </span>
                    <span>
                      <FileText size={16} />
                      Merchant specification
                    </span>
                    <span>
                      <ImageIcon size={16} />
                      Product image
                    </span>
                  </div>
                  <button
                    className="primary large"
                    disabled={busy || loading}
                    onClick={session ? audit : start}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : session ? (
                      <Play size={16} />
                    ) : (
                      <Plus size={18} />
                    )}{" "}
                    {session ? "Run product audit" : "Start the demo"}
                    <ArrowRight size={18} />
                  </button>
                  <small className="under-button">
                    {session
                      ? "Live Gemini analysis · no changes without approval"
                      : "Creates a private, versioned copy of the demo storefront."}
                  </small>
                </section>
                <figure className="hero-product">
                  <img
                    src="/commuter-one.png"
                    alt="AI-generated demonstration: olive green backpack with a cream bottle beside it"
                  />
                  <div className="photo-index">COMPOSITION 01 / 01</div>
                  <div className="product-caption">
                    <div>
                      <span className="eyebrow">THE SUBJECT</span>
                      <h3>Commuter One</h3>
                      <span>Everyday carry · Synthetic product</span>
                    </div>
                    <ArrowUpRight size={24} />
                  </div>
                </figure>
              </div>
              <div className="principles">
                <article>
                  <span>01</span>
                  <div>
                    <h3>Read the evidence</h3>
                    <p>Feedback, specifications and images, together.</p>
                  </div>
                </article>
                <article>
                  <span>02</span>
                  <div>
                    <h3>Change only what’s needed</h3>
                    <p>Small, source-linked edits you can inspect.</p>
                  </div>
                </article>
                <article>
                  <span>03</span>
                  <div>
                    <h3>Verify the result</h3>
                    <p>A real published version. A way back.</p>
                  </div>
                </article>
              </div>
              {session && (
                <section className="panel imports">
                  <div>
                    <span className="eyebrow">YOUR INPUTS</span>
                    <h2>Bring another question.</h2>
                    <p className="muted">
                      Up to 20 feedback items and two images per product.
                    </p>
                  </div>
                  <div className="feedback-input">
                    <label htmlFor="feedback">Customer feedback</label>
                    <textarea
                      id="feedback"
                      value={feedback}
                      maxLength={6000}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="What confused your customer?"
                    />
                    <div className="button-row">
                      <button
                        className="secondary"
                        disabled={busy || !feedback.trim()}
                        onClick={saveEvidence}
                      >
                        <Plus size={15} />
                        Add feedback
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => importRef.current?.click()}
                      >
                        <Upload size={15} />
                        Import JSON
                      </button>
                      <button
                        className="text-button"
                        disabled={
                          busy ||
                          evidence.filter((e) => e.kind === "image").length >= 2
                        }
                        onClick={() => imageRef.current?.click()}
                      >
                        <ImageIcon size={15} />
                        Add image
                      </button>
                    </div>
                    <small>
                      JSON format: {`{"sku":"commuter-one","feedback":["..."]}`}
                      <br />
                      Images: PNG or JPEG · 5 MB maximum · one additional image
                      available
                    </small>
                    <input
                      ref={importRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void importJson(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      hidden
                      onChange={(e) => {
                        if (e.target.files?.[0]) void upload(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </section>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <div className="page-heading compact">
                <div>
                  <div className="eyebrow">02 / EVIDENCE WORKBENCH</div>
                  <h1>
                    Every change starts
                    <br />
                    <span>with a reason.</span>
                  </h1>
                  <p>
                    Find the source. Separate a page problem from a product
                    problem.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={audit}
                  disabled={busy || run?.status === "running"}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}{" "}
                  {run ? "Reassess evidence" : "Run audit"}
                </button>
              </div>
              <div className="work-grid">
                <section className="panel issue-panel">
                  <div className="panel-title">
                    <h3>What needs attention</h3>
                    <span>{run?.issues.length || "—"}</span>
                  </div>
                  {busy && (
                    <div className="running" role="status">
                      <LoaderCircle className="spin" size={22} />
                      <strong>{phase || "Starting audit"}</strong>
                      <p>Reading your actual product evidence.</p>
                    </div>
                  )}
                  {!busy && !run && (
                    <div className="empty">
                      <Search size={26} />
                      <h3>Ready when you are.</h3>
                      <p>Run the audit to identify repairable issues.</p>
                    </div>
                  )}
                  {run?.status === "failed" && (
                    <div className="empty">
                      <AlertTriangle size={24} />
                      <h3>Run stopped safely.</h3>
                      <p>{messages[run.error || ""] || run.error}</p>
                      <small>No page changes were published.</small>
                      {!!run.validationNotes?.length && (
                        <details>
                          <summary>Why the check stopped this run</summary>
                          <ul>
                            {run.validationNotes.map((note, i) => (
                              <li key={i}>{note}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                  {run?.issues.map((i) => (
                    <button
                      key={i.id}
                      className={
                        "issue-card " +
                        (selectedIssue === i.id ? "selected" : "")
                      }
                      onClick={() =>
                        setSelectedIssue(selectedIssue === i.id ? null : i.id)
                      }
                    >
                      <span className={"status " + i.status}>
                        {statusNames[i.status]}
                      </span>
                      <h3>{i.title}</h3>
                      <p>{i.explanation}</p>
                      {i.question && <p className="question">{i.question}</p>}
                      <span className="issue-footer">
                        {i.evidenceIds.length} linked sources{" "}
                        <ChevronRight size={15} />
                      </span>
                    </button>
                  ))}
                </section>
                <section className="panel product-preview">
                  <div className="panel-title">
                    <h3>Current storefront</h3>
                    <span className="tag">
                      Version {session?.currentVersion}
                    </span>
                  </div>
                  <img
                    src="/commuter-one.png"
                    alt="AI-generated backpack and bottle demonstration"
                  />
                  <div className="preview-copy">
                    <span className="eyebrow">COMMUTER COLLECTION</span>
                    <h2>{session?.name}</h2>
                    <p>{version?.content.shortDescription}</p>
                    <div className="caption-label">IMAGE CAPTION</div>
                    <p>{version?.content.imageCaption}</p>
                    <div className="caption-label">FAQ</div>
                    <p style={{ whiteSpace: "pre-line" }}>
                      {version?.content.faq}
                    </p>
                  </div>
                </section>
                <section className="source-column">
                  <div className="panel">
                    <div className="panel-title">
                      <h3>Source of truth</h3>
                      <span>{evidence.length}</span>
                    </div>
                    {evidence
                      .filter(
                        (e) =>
                          !selectedIssue ||
                          run?.issues
                            .find((i) => i.id === selectedIssue)
                            ?.evidenceIds.includes(e.id),
                      )
                      .map((e) => (
                        <button
                          className="source-card"
                          key={e.id}
                          onClick={() => setSource(e)}
                        >
                          {e.kind === "spec" ? (
                            <FileText size={18} />
                          ) : e.kind === "image" ? (
                            <ImageIcon size={18} />
                          ) : (
                            <MessageSquare size={18} />
                          )}
                          <span>
                            <strong>{e.label}</strong>
                            <small>
                              {e.kind === "spec"
                                ? "Merchant confirmed"
                                : e.kind === "feedback"
                                  ? "Problem signal · not product fact"
                                  : "Visible objects only"}
                            </small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    <button
                      className="text-button full"
                      onClick={openSpec}
                      disabled={busy}
                    >
                      <Plus size={15} />
                      Supply missing information
                    </button>
                  </div>
                  <div className="activity">
                    <span className="eyebrow">RUN ACTIVITY</span>
                    {(activity.length
                      ? activity
                      : run?.events.map((e) => e.phase) || []
                    ).map((a, i) => (
                      <p key={i}>
                        <span className="dot" />
                        {a}
                      </p>
                    ))}
                    {run?.status === "completed" && (
                      <p>
                        <CheckCheck size={15} />
                        {run.calls} model calls · {run.tools} read-only tools
                      </p>
                    )}
                  </div>
                  {patch && (
                    <button className="primary full" onClick={() => setStep(2)}>
                      Review {patch.changes.length} changes{" "}
                      <ArrowRight size={17} />
                    </button>
                  )}
                </section>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="page-heading compact">
                <div>
                  <div className="eyebrow">03 / REVIEW & PUBLISH</div>
                  <h1>
                    Small changes.
                    <br />
                    <span>Clear evidence.</span>
                  </h1>
                  <p>
                    You approve the exact wording, evidence and page version.
                  </p>
                </div>
                {patch && (
                  <span className={"status " + patch.status}>
                    {statusNames[patch.status]}
                  </span>
                )}
              </div>
              {!patch ? (
                <div className="empty panel">
                  <ClipboardCheck size={32} />
                  <h2>No changes waiting for approval.</h2>
                  <p>Run an audit to create an evidence-linked patch.</p>
                  <button className="primary" onClick={() => setStep(1)}>
                    Open workbench <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="review-layout">
                    <div>
                      {patch.changes.map((c) => (
                        <section className="panel diff-card" key={c.field}>
                          <div className="panel-title">
                            <h3>{fieldNames[c.field]}</h3>
                            <span className="tag">Minimal replacement</span>
                          </div>
                          <div className="diff-grid">
                            <div className="before">
                              <span className="eyebrow">
                                BEFORE · V{patch.baseVersion}
                              </span>
                              <p>
                                {
                                  session?.versions.find(
                                    (v) => v.version === patch.baseVersion,
                                  )?.content[c.field]
                                }
                              </p>
                            </div>
                            <div className="after">
                              <span className="eyebrow">PROPOSED</span>
                              <p>{c.value}</p>
                            </div>
                          </div>
                          <div className="claim-list">
                            {c.claims.map((claim, i) => (
                              <div key={i}>
                                <ShieldCheck size={16} />
                                <p>{claim.text}</p>
                                {claim.evidenceIds.map((id) => (
                                  <button
                                    key={id}
                                    className="source-link"
                                    onClick={() =>
                                      setSource(
                                        session?.evidence.find(
                                          (e) => e.id === id,
                                        ) || null,
                                      )
                                    }
                                  >
                                    View source <ArrowUpRight size={12} />
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                    <aside className="panel approval-panel">
                      <ShieldCheck size={26} />
                      <h2>Ready for your judgment.</h2>
                      <p className="muted">
                        Automated checks reduce mistakes. They do not replace
                        your review.
                      </p>
                      <ul>
                        {patch.checks.map((c) => (
                          <li key={c}>
                            <Check size={15} />
                            {c}
                          </li>
                        ))}
                      </ul>
                      <div className="approval-meta">
                        <span>
                          Page version<strong>{patch.baseVersion}</strong>
                        </span>
                        <span>
                          Evidence revision
                          <strong>{patch.evidenceRevision}</strong>
                        </span>
                        <span>
                          Patch fingerprint
                          <strong>{patch.hash.slice(0, 10)}</strong>
                        </span>
                      </div>
                      {patch.status === "stale" ? (
                        <>
                          <p className="warning-copy">
                            Sources or the page have changed. This patch cannot
                            be published.
                          </p>
                          <button
                            className="primary full"
                            onClick={audit}
                            disabled={busy}
                          >
                            Reassess evidence
                          </button>
                        </>
                      ) : patch.status === "published" ? (
                        <button
                          className="primary full"
                          onClick={() => setStep(3)}
                        >
                          View published version <ArrowRight size={16} />
                        </button>
                      ) : (
                        <>
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={reviewed}
                              onChange={(e) => setReviewed(e.target.checked)}
                            />
                            <span>
                              I reviewed every changed fact against its source
                              and approve this exact wording.
                            </span>
                          </label>
                          <button
                            className="primary full"
                            disabled={!reviewed || busy}
                            onClick={publishPatch}
                          >
                            {busy ? (
                              <LoaderCircle className="spin" size={17} />
                            ) : (
                              <Check size={17} />
                            )}
                            Approve & publish
                          </button>
                          <small>
                            Publishes only to your isolated demo storefront.
                            Approval expires after 10 minutes.
                          </small>
                        </>
                      )}
                    </aside>
                  </div>
                </>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <div className="page-heading compact">
                <div>
                  <div className="eyebrow">04 / LIVE & HISTORY</div>
                  <h1>
                    Published.
                    <br />
                    <span>And accountable.</span>
                  </h1>
                  <p>A version you can inspect. A change you can undo.</p>
                </div>
                <a
                  className="primary"
                  href={`/store/${session?.sku}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open storefront <ExternalLink size={16} />
                </a>
              </div>
              <div className="history-layout">
                <section className="panel">
                  <div className="panel-title">
                    <h3>Version history</h3>
                    <span className="tag">
                      Current: v{session?.currentVersion}
                    </span>
                  </div>
                  {session?.versions
                    .slice()
                    .reverse()
                    .map((v) => (
                      <div className="version-row" key={v.version}>
                        <span className="version-number">
                          {String(v.version).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>
                            {v.kind === "initial"
                              ? "Original product page"
                              : v.kind === "rollback"
                                ? `Restored from version ${v.restoredFrom}`
                                : "Approved changes published"}
                          </strong>
                          <small>
                            {new Date(v.at).toLocaleString("en-GB")}
                            {v.version === session.currentVersion
                              ? " · Current version"
                              : ""}
                          </small>
                        </div>
                        {v.version !== session.currentVersion && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              action(async () => {
                                await request(
                                  `pages/${session.sku}/rollback`,
                                  {
                                    targetVersion: v.version,
                                    baseVersion: session.currentVersion,
                                  },
                                  {
                                    "idempotency-key": `rollback-${session.currentVersion}-${v.version}`,
                                  },
                                );
                                await refresh();
                                setNotice(
                                  "A new version restores the selected content. Earlier history is preserved.",
                                );
                              })
                            }
                          >
                            <RotateCcw size={14} />
                            Restore
                          </button>
                        )}
                      </div>
                    ))}
                </section>
                <section className="panel verify-panel">
                  <CheckCheck size={27} />
                  <h2>Check the live result.</h2>
                  <p className="muted">
                    Read the served storefront and compare it with the approved
                    changes. Publishing and verification are separate steps.
                  </p>
                  {verification ? (
                    <>
                      <span
                        className={
                          "status " +
                          (verification.status === "passed"
                            ? "repairable"
                            : "conflict")
                        }
                      >
                        {verification.status === "passed"
                          ? "Storefront checks passed"
                          : "Check needs attention"}
                      </span>
                      <ul>
                        {verification.checks.map((c, i) => (
                          <li key={i}>
                            {c.passed ? <Check size={16} /> : <X size={16} />}{" "}
                            {c.label}
                          </li>
                        ))}
                      </ul>
                      {verification.unresolved.length > 0 && (
                        <div className="unresolved">
                          <strong>Still needs human attention</strong>
                          {verification.unresolved.map((x) => (
                            <p key={x}>{x}</p>
                          ))}
                        </div>
                      )}
                      <small>
                        Checks confirm the approved content is served. They do
                        not prove customer confusion or returns have decreased.
                      </small>
                    </>
                  ) : (
                    <p className="warning-copy">
                      This version has not been checked yet.
                    </p>
                  )}
                  <button
                    className="primary full"
                    disabled={busy || session?.currentVersion === 1}
                    onClick={() =>
                      action(async () => {
                        await request(`pages/${session!.sku}/verify`, {
                          version: session!.currentVersion,
                        });
                        await refresh();
                      })
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <ShieldCheck size={17} />
                    )}
                    Check published page
                  </button>
                </section>
              </div>
            </>
          )}
          <footer>
            <span>
              MerchReflex <span className="footer-dot">/</span> Evidence before
              execution.
            </span>
            <span>Built with Gemini & Google Cloud</span>
          </footer>
        </main>
      </div>
      {(source || editing) && (
        <div
          className="drawer-backdrop"
          onClick={() => {
            setSource(null);
            setEditing(false);
          }}
        >
          <aside
            className="drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              editing ? "Update merchant specification" : "Evidence source"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="drawer-close"
              aria-label="Close evidence"
              onClick={() => {
                setSource(null);
                setEditing(false);
              }}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">
              {editing ? "SUPPLY MISSING INFORMATION" : "ORIGINAL SOURCE"}
            </div>
            <h2>{editing ? "Update the specification." : source?.label}</h2>
            {editing ? (
              <>
                <p>
                  Replace the complete specification. Preserve accurate existing
                  facts and resolve unknown or contradictory details.
                </p>
                <label htmlFor="spec">Merchant specification</label>
                <textarea
                  id="spec"
                  className="spec-input"
                  maxLength={6000}
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                />
                <button
                  className="text-button"
                  onClick={() =>
                    setSpec(
                      "Merchant-confirmed synthetic specification: Package contains one backpack only. The water bottle shown is a styling prop and is NOT included. The fabric is suitable for light rain only, not immersion or heavy rain. Laptop sleeve internal dimensions: 32 × 23 × 3 cm. No universal device compatibility has been verified.",
                    )
                  }
                >
                  Use synthetic demo measurements
                </button>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    I confirm this specification for the synthetic demo. This is
                    not a certification.
                  </span>
                </label>
                <button
                  className="primary full"
                  disabled={busy || !confirmed || !spec.trim()}
                  onClick={saveEvidence}
                >
                  Save new evidence version <ArrowRight size={17} />
                </button>
                <p className="muted">
                  Existing approvals become invalid. Run a reassessment to use
                  the new evidence.
                </p>
              </>
            ) : (
              <>
                {source?.kind === "image" && (
                  <img
                    className="evidence-image"
                    src={`/api/images/${source.id}`}
                    alt={source.label}
                  />
                )}
                <div className="source-original">{source?.text}</div>
                <dl>
                  <dt>Product</dt>
                  <dd>{source?.sku}</dd>
                  <dt>Evidence revision</dt>
                  <dd>{source?.revision}</dd>
                  <dt>Source ID</dt>
                  <dd>{source?.id}</dd>
                  <dt>Content fingerprint</dt>
                  <dd>{source?.hash.slice(0, 20)}</dd>
                  <dt>Role</dt>
                  <dd>
                    {source?.kind === "spec"
                      ? "Merchant-confirmed synthetic facts"
                      : source?.kind === "image"
                        ? "Visible appearance only"
                        : "Customer signal, not proof of product facts"}
                  </dd>
                </dl>
                {source?.kind === "spec" && (
                  <button className="secondary" onClick={openSpec}>
                    Supply missing information <Plus size={16} />
                  </button>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
