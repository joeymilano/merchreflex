# Submission checklist — AI Builder Cup 2026

Team: Finfold Growth Lab. Product: MerchReflex. Theme: Retail & Commerce.

Internal target: October 17, 2026, 20:00 Asia/Shanghai. The Roadmap shows October 19, 02:29 CST; the submission form has inconsistent timezone labelling. Do not rely on the final hours.

## Required deliverables

- [ ] Live Cloud Run application independently tested
- [x] Public GitHub source, lockfile, reproduction steps, attribution and limitations
- [x] Official template working draft exported to PDF, 16 pages, 646,475 bytes (final results and video pending)
- [ ] Public English video, short cut 2:55, duration conflict clarified if possible
- [ ] English description under 1,024 characters
- [ ] All links opened from a fresh browser
- [ ] Submission success visibly confirmed; saved evidence of receipt
- [ ] Evaluation-period availability checked through November 7, 02:29 Asia/Shanghai

Official template has 16 slides: team, download instruction, idea, opportunities, features, process, optional wireframes, architecture, technologies, optional costs, prototype snapshots, performance, future, links, two blank slides. Preserve required headings and layout; remove template-only instructions/blank slides if the organizer permits. Do not substitute an unrelated deck design.

## Draft description — verify against the final release

MerchReflex turns customer feedback into evidence-linked product-page repairs. Gemini reads feedback, specifications and images, separates content issues from quality or delivery problems, and proposes minimal changes. A separate semantic check and deterministic gates restrict what can be published. Merchants review exact wording before a Firestore transaction creates a new page version. New evidence invalidates old approvals. The application fetches the deployed demo storefront to check the result and supports versioned rollback. It runs on Google Cloud Run with Firestore and private Cloud Storage. Products and feedback are synthetic, and the demo image is AI-generated. Evaluation reports task quality and reliability, not unproven revenue or return-rate improvements.

Official portal: https://hack2skill.com/event/aibuildercup2026/dashboard/submissions/6a5da99a444e4f43e5657a85
Template: https://docs.google.com/presentation/d/13rg7vW43mEH6DkpuusAE6fdoEylSFz8waNpE4RLzoUg/edit
FAQ: https://aibuildercup.com/Faqs.html
