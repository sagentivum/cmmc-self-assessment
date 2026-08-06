# CMMC / NIST SP 800-171 Self-Assessment App — Implementation Plan

Derived from the DCMA DIBCAC public self-assessment Access database (v1.1).
Data extraction is **already complete** — see `data/` and `extract/`.

**Build order is deploy-early**: prove the GitHub Pages pipeline on the shell
(after Phase 4), then build the three views, then redeploy. A subpath 404 costs
a minute to fix on an empty shell and a whole run to fix at the end.

---

## 1. Verified data facts

All independently confirmed against `data/cmmc.sqlite`.

| Fact | Value |
|---|---|
| Requirements | 110, `sort` contiguous 1–110 |
| Objectives | 320, zero orphans, every requirement ≥1 |
| Families | 14 |
| Weights | `{0:1, 1:51, 3:14, 5:44}` → Σ = **313** |
| Floor | 110 − 313 = **−203** |
| Partial credit | exactly `3.5.3` and `3.13.11`, both weight 5 → partial 3 |
| Zero weight | exactly `3.12.4` (SSP), which still has **8 objectives** |
| CMMC levels | L1 = 17 reqs / 63 pts; L2 = 93 reqs / 250 pts |
| Evidence standard | Document 126, Screen Share 93, Artifact 82, Physical Review 18, Artifact and Screen Share 1 — **zero nulls** |
| Family weights | AC 54, SC 42, CM 33, SI 31, IA 27, MP 23, AU 19, MA 18, PE 14, CA 13, AT 11, IR 11, RA 9, PS 8 |
| Text hygiene | no HTML remnants; 17 smart quotes; 53 discussions with double spaces; longest discussion 2769 chars |

### Authoritative scoring cascade (`Qry_Summary`)

Four-way, not three — there is a terminal else-zero:

```
satisfied                      → 0
else other-than-satisfied      → weight
else special-considerations    → partial_weight
else                           → 0
```

`score = 110 - Σ deductions`

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 7 | first-class `base` handling for subpaths, static output |
| UI | React 19 + TypeScript strict | boring, deep ecosystem; strict TS is the correctness lever |
| Router | React Router 7, **HashRouter** | GH Pages project pages have no rewrite rule; `BrowserRouter` deep links 404 without the `404.html` hack |
| State | Zustand + `persist` | tiny, testable outside React, explicit `version`/`migrate` |
| Validation | Zod | one schema for persisted state, imports, and build-time catalogue validation |
| Tests | Vitest + Testing Library + fast-check + Playwright | fast-check *proves* the −203 floor rather than sampling it |
| Oracle | `node:sqlite` (built into Node 24) | run transliterated `Qry_Summary` against `data/cmmc.sqlite`, diff vs the TS engine |
| Charts | hand-rolled SVG | one waterfall + one bar table; a chart lib is more bytes and more CDN risk |
| Fonts | system stack only | no external request; the privacy constraint is absolute |

**Rejected:** Next.js (SSR machinery you'd disable), `sql.js` in browser (~1.5 MB wasm to query 110 rows), any analytics/error-reporting SDK.

**Data delivery:** compile `data/catalogue.json` into the JS bundle via codegen. Not `fetch()`. Makes "no network calls at runtime" literally true and removes an entire base-URL bug class.

---

## 3. Layout

```
/                              repo root — data/ and extract/ stay untouched
  data/catalogue.json          source of truth, read-only
  data/cmmc.sqlite             test oracle only, never shipped
  extract/                     unchanged
  app/
    package.json               engines: node >=24 ; packageManager: pnpm@10
    vite.config.ts             base from env; build.target esnext
    index.html                 CSP meta, no external anything
    public/.nojekyll
    scripts/gen-catalogue.mts  prebuild codegen
    src/
      generated/catalogue.ts       typed, frozen, normalised
      generated/catalogue.meta.ts  hash, counts, sourceFile
      domain/types.ts  domain/catalogue.ts  domain/evidence.ts
      scoring/constants.ts  scoring/engine.ts  scoring/waterfall.ts
      state/store.ts  state/schema.ts  state/migrate.ts  state/io.ts
      views/assess/  views/evidence/  views/score/  views/about/
      components/   lib/   styles/
    tests/           e2e/
  .github/workflows/deploy.yml
```

---

## 4. Codegen (`scripts/gen-catalogue.mts`)

Runs as `prebuild` and `pretest`. Reads `../data/catalogue.json` and:

1. Zod-validates the shape — **build fails** on drift.
2. Normalises whitespace (collapse the 53 double-space runs; keep smart quotes for display, emit a folded `searchText` with straight quotes, lowercased).
3. Derives `cmmcLevel` from `cmmc_practice` (`AC.L1-…` → 1).
4. Derives `evidenceSlug` (`Screen Share` → `screen-share`).
5. Computes SHA-256 `catalogueHash` over canonical JSON.
6. Emits `src/generated/catalogue.ts` (frozen readonly array) + `catalogue.meta.ts`.

Commit the generated files; add a CI check that regeneration produces no diff.

---

## 5. Scoring engine interface

`src/scoring/constants.ts`

```ts
export const MAX_SCORE = 110;
// Derived from the catalogue at module init, never a literal:
export const TOTAL_WEIGHT: number;   // 313
export const MIN_SCORE: number;      // MAX_SCORE - TOTAL_WEIGHT === -203
```

`src/domain/types.ts`

```ts
export type Status = 'unassessed' | 'satisfied' | 'partial' | 'not-satisfied';
export type ObjectiveStatus = 'unassessed' | 'satisfied' | 'not-satisfied';

export interface Objective {
  objective: string;            // "3.1.1[a]" — NOTE: may equal requirement id
  requirement: string;
  text: string;
  evidenceStandard: EvidenceStandard;
  evidenceSlug: EvidenceSlug;
  searchText: string;
}

export interface Requirement {
  requirement: string;          // "3.1.1"
  sort: number;                 // 1..110
  cmmcPractice: string;         // "AC.L1-3.1.1"
  cmmcLevel: 1 | 2;
  familyNumber: string;         // "3.1"
  familyName: string;
  cmmcDomain: string;           // "AC"
  description: string;
  discussion: string;
  weight: 0 | 1 | 3 | 5;
  partialWeight: number | null; // 3 for 3.5.3 & 3.13.11 only
  partialRule: string | null;   // verbatim DCMA text, rendered as a quotation
  objectives: readonly Objective[];
  searchText: string;
}
```

`src/scoring/engine.ts`

```ts
/** Single-requirement deduction. Mirrors Qry_Summary's IIf cascade exactly.
 *  Returns a NON-NEGATIVE number of points removed.
 *  Throws in dev if status === 'partial' on a requirement with partialWeight === null. */
export function deductionFor(req: Requirement, status: Status): number;

export interface RequirementScore {
  requirement: string;
  status: Status;
  weight: number;
  partialWeight: number | null;
  partialEligible: boolean;
  deduction: number;          // >= 0
  pointsAtRisk: number;       // weight, if not yet satisfied
}

export interface DomainScore {
  familyNumber: string;
  familyName: string;
  cmmcDomain: string;
  requirementCount: number;
  possibleDeduction: number;  // fixed family weight
  deduction: number;
  assessedCount: number;
  counts: Record<Status, number>;
}

export interface WaterfallStep {
  key: string;
  label: string;
  deduction: number;          // >= 0
  runningScore: number;
}

export interface ScoreResult {
  score: number;                     // in [MIN_SCORE, MAX_SCORE]
  totalDeduction: number;
  maxScore: number;                  // 110
  minScore: number;                  // -203
  totalWeight: number;               // 313
  requirementCount: number;          // 110
  assessedCount: number;
  percentComplete: number;
  counts: Record<Status, number>;
  byRequirement: readonly RequirementScore[];  // catalogue sort order
  byDomain: readonly DomainScore[];            // family sort order
  waterfall: readonly WaterfallStep[];
  poamCount: number;
  poamOverdueCount: number;
}

export function scoreAssessment(
  catalogue: readonly Requirement[],
  assessment: Assessment,
  opts?: { now?: Date; waterfallBy?: 'domain' | 'requirement' }
): ScoreResult;

/** Throws with a specific message on any violation. Tests + dev boot. */
export function assertCatalogueInvariants(catalogue: readonly Requirement[]): void;
```

**Three rules:**
- **Pure.** No React, no store, no `Date.now()`, no localStorage. `now` is injected.
- **No defensive clamp.** The score must land in range naturally. `Math.min/max` would hide a real bug — assert the range in dev, prove it with property tests.
- **Recompute wholesale.** 110 requirements is sub-millisecond. No incremental scoring.

State shape (`src/state/schema.ts`):

```ts
export interface RequirementEntry { status: Status; poam: boolean; poamDate: string | null; note?: string; updatedAt: string }
export interface ObjectiveEntry   { status: ObjectiveStatus; evidenceNote?: string; prepared?: boolean; updatedAt: string }

export interface Assessment {
  schemaVersion: 1;
  catalogueHash: string;
  orgLabel?: string;
  createdAt: string; updatedAt: string;
  requirements: Record<string, RequirementEntry>;   // keyed by requirement id
  objectives:  Record<string, ObjectiveEntry>;      // SEPARATE map — see gotcha B
}
```

---

## 6. The three views

**Assess** — `#/assess`, `#/assess/:family`, `#/assess/:family/:requirement`.
Family rail with per-family progress and points-at-risk. Requirement rows with practice/level chip, weight chip, and a **radiogroup** segmented control (Satisfied / Not satisfied / Partial — the third rendered *only* for 3.5.3 and 3.13.11). POA&M toggle + date. Detail pane: collapsible discussion, objective table (status, evidence chip, note), and `partial_rule` rendered verbatim as an attributed quotation. Filters: status, level, weight, POA&M, has-unassessed-objectives, free text. Keyboard: `j`/`k`, `1`/`2`/`3`, `p`.

**Evidence** — `#/evidence`, `#/evidence/:standardSlug`.
Five buckets; slugs are frozen public API: `document`, `screen-share`, `artifact`, `physical-review`, `artifact-and-screen-share`. Within a bucket group family → requirement → objective. Objective text already reads "Determine if…", which *is* the assessor's question — do not rewrite it. Each row gets a "prepared" check and an evidence note. Export a printable evidence-request list filtered to objectives under not-satisfied or unassessed requirements.

Bucket headers carry a short gloss ("Document — the assessor will ask for a written artefact") that **must be visually and typographically marked as editorial**, because DCMA did not write it. Design `physical-review` (18, mostly PE/MP) as the natural "site walk" card. Design `artifact-and-screen-share` for **n = 1** — it must not render as a peer-sized empty-looking card.

**Score** — `#/score`.
Score number with explicit range context (110 ceiling, −203 floor) and, adjacent and equally prominent, the completeness meter. Waterfall from 110 down, one bar per family (toggle to per-requirement), y-domain spanning both 110 and the current score with an explicit zero baseline — crossing zero is the fiddly bit. Per-domain table (deductions taken / possible). "Points on the table": unassessed-or-not-satisfied requirements ranked by weight, 5-pointers first. POA&M register with overdue highlighting. Label it "SPRS-methodology score, self-computed" — **never imply it is a submission**.

---

## 7. Test list

**Catalogue invariants** (fail the build, not just the suite)
1. exactly 110 requirements
2. exactly 320 objectives, zero orphans, every requirement ≥1
3. Σ weights === 313
4. `MIN_SCORE === MAX_SCORE - Σ weights === -203` — **derived from data, never a literal**
5. weights ⊆ {0,1,3,5}, all ≥ 0; exactly one weight-0 and it is `3.12.4`
6. partial-eligible set === exactly `{3.5.3, 3.13.11}`, both weight 5 / partial 3
7. 14 families; each requirement in exactly one; family weights sum to 313
8. `sort` is 1…110, no gaps or duplicates
9. `cmmc_practice` domain prefix matches family `cmmc_domain` for all 110
10. `evidence_standard` non-null for all 320, ∈ the 5 values, counts exactly 126/93/82/18/1
11. objective ids unique; the 23 whose id equals their requirement id are all single-objective requirements
12. `catalogueHash` matches committed meta (silent data drift fails CI)

**Scoring**
13. all-unassessed → **110**, deduction 0, percentComplete 0
14. all-satisfied → **110** (ceiling) — distinguishable from 13 by percentComplete 100
15. all-not-satisfied → **−203** exactly (floor)
16. all-not-satisfied with both partials set to `partial` → **−199** (each saves 2)
17. `3.12.4` not-satisfied changes the score by 0
18. one 5-pointer → 105; one 3 → 107; one 1 → 109
19. partial on `3.5.3` → 107; on `3.13.11` → 107; both → 104
20. `partial` on a non-eligible requirement throws (never silently deducts `null`)
21. `Qry_Summary` precedence honoured: satisfied ≻ OTS ≻ partial
22. **property:** 5 000 random assessments → score always ∈ [−203, 110]
23. **property:** score === 110 − Σ deductions, always
24. **property:** Σ domain deductions === totalDeduction, always
25. waterfall starts at 110, ends at `score`, steps sum to totalDeduction, monotonically non-increasing
26. **property:** randomising all 320 objective statuses never changes the score
27. per-domain `possibleDeduction` matches the fixed family table
28. **oracle:** transliterated `Qry_Summary` SQL run against `data/cmmc.sqlite` via `node:sqlite` over N random assessments === TS engine output

**State / persistence**
29. store round-trips localStorage with version + hash
30. export → import is state- and score-identical
31. import rejects malformed JSON, newer `schemaVersion`, non-object payloads
32. import with mismatched `catalogueHash` warns, accepts, drops unknown keys, reports what it dropped
33. unknown requirement ids in persisted state are ignored without crashing
34. localStorage unavailable (private mode / quota) degrades to in-memory with a visible warning
35. clear resets to all-unassessed, 110 / 0 %
36. POA&M overdue computed from injected `now`, not `Date.now()`

**Privacy & compliance** (these are requirements, so they are tests)
37. source scan: no `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource` in `src/`
38. built `dist/` contains no external origin beyond an allowlist of anchor hrefs
39. `package.json` contains no analytics/telemetry dependency (allowlist)
40. `index.html` ships CSP meta including `connect-src 'none'`
41. no file in `public/` or `src/assets` matches `/dod|dcma|seal|eagle/i`, and no `alt` text does either
42. disclaimer renders in the header of all three views **and** is embedded in the exported JSON
43. built asset URLs are subpath-relative; no absolute `/assets/` root paths

**E2E (Playwright — keep to four)**
44. acknowledge notice → set `3.1.1` not satisfied → score 105 → reload → still 105
45. export downloads a file; clear; import restores
46. deep link `#/evidence/physical-review` renders 18 objectives
47. served from a subpath: boots with zero 404s and **zero cross-origin requests** (route interception asserts this)

---

## 8. Build order (deploy-early)

- **Phase 0 — scaffold.** `git init`; MIT for code + provenance note for the data; Vite react-ts in `app/`; `.nvmrc` Node 24; TS strict; Vitest/Playwright/ESLint/Prettier.
- **Phase 1 — data pipeline (the gate).** `gen-catalogue.mts` + invariants 1–12 + the `node:sqlite` oracle harness. **Do not start UI until green.**
- **Phase 2 — scoring engine.** Pure module + tests 13–28, including fast-check and the oracle diff.
- **Phase 3 — state.** Zustand store, Zod schemas, migrate, export/import; tests 29–36.
- **Phase 4 — shell.** HashRouter, layout, permanent disclaimer banner, first-run interstitial, `/about` provenance page, system fonts, dark/light; tests 40–43.
- **Phase 4.5 — FIRST DEPLOY.** Ship the shell to GitHub Pages and verify the live subpath URL end to end. Prove the pipeline here, not at the end.
- **Phase 5 — Assess.** Largest surface; build against the already-proven engine.
- **Phase 6 — Evidence.** Buckets, editorial glosses, prep checklist, evidence-request export.
- **Phase 7 — Score.** Header + completeness, SVG waterfall, domain table, points-on-the-table, POA&M register.
- **Phase 8 — REDEPLOY + verify.** Full E2E 44–47 against the live subpath build.
- **Phase 9 — polish (only if room).** Print stylesheet, OTS export mirroring `Qry_OTS`, keyboard nav, axe pass.

---

## 9. Gotchas

**A. A blank assessment scores 110 — indistinguishable from a perfect one.** Highest-severity trap, and faithful to the source (which is exactly why `Qry_Percent_Requirements_Complete` exists). Score and completeness must always render together; a bare "110" on an untouched assessment is a defect.

**B. Objective ids collide with requirement ids.** 23 single-objective requirements have an objective whose id *is* the requirement id (`3.10.4`, `3.13.11`, `3.7.1`, …). Never merge them into one map, one route param, or one set of DOM ids. Namespace anything shared (`req:3.10.4` / `obj:3.10.4`).

**C. Objective status has zero effect on the score.** The DB scores only requirement-level flags. Do not auto-roll-up — that invents methodology. Offer a *suggestion* ("all 6 objectives met — mark satisfied?") plus an inconsistency badge, both user-confirmed. Test 26 locks this.

**D. The two scoring queries disagree on contradictory input.** `Qry_Summary` checks Satisfied first; `Qry_Scorecard_Feed`'s `WHERE` never checks it, so a row flagged both Satisfied and OTS deducts under the Feed and not under Summary. Resolve by making status a single enum so the contradiction is unrepresentable; implement `Qry_Summary`'s cascade; document the choice in `/about`.

**E. `Sum(Abs(TotalScore))` hints the source tolerated negative weights.** Ours are all positive so `Abs` is a no-op. Do **not** replicate it — assert `weight >= 0` at build (invariant 5) so a future sign flip fails loudly.

**F. Do not port `Qry_Percent_Requirements_Complete`.** `Round((110-[Remaining])/Count(…)*100)` sums three booleans that can both be set, double-counting. Compute completeness from the enum: `assessed / 110`.

**G. `Qry_All_Objectives` is stale and references columns that do not exist.** It selects `Typical_Technologies_Used`, `Typical_Questions_Asked`, `Observation`; `Tbl_Objectives` has nine columns and none are those. **There is no "typical questions asked" data.** The Evidence view's "what will an assessor ask to see" framing must be built from `evidence_standard` + objective text + your own clearly-labelled gloss. This is the likeliest place to accidentally imply DCMA authorship.

**H. `3.12.4` (the SSP) has weight 0 but 8 objectives.** It can never move the score yet is expensive to assess. Sorting by weight buries it — make sure it isn't visually treated as "done" or filtered away. Do **not** add POA&M-eligibility logic for it; that rule lives in 32 CFR 170, not in this file.

**I. Render `partial_rule` verbatim.** 3.5.3's text is compressed and reads ambiguously against the published methodology; 3.13.11's encodes both the 5 and 3 case in one sentence. Quote both, attributed to the source file. Never paraphrase into UI copy.

**J. The one "Artifact and Screen Share" objective is 3.13.11** — simultaneously the FIPS partial-credit requirement, a single-objective requirement (so it also hits B), and an n = 1 bucket. Three edge cases in one row.

**K. Evidence values contain spaces.** Slugs become frozen public API via deep links; cover them with a test.

**L. Dotted-decimal ids sort wrong lexically** (`3.1.10 < 3.1.2`). Always sort requirements and families by the integer `sort`. Objective suffixes happen to be single letters `[a]`–`[o]` so lexical works — codify that in a comparator with a test rather than relying on the coincidence.

**M. The source CSVs carry stray trailing whitespace on 106/110 join keys**; `build.py` strips it. Any re-extraction must preserve that. The `catalogueHash` check is the canary.

**N. Discussions are walls of text.** 103 of 110 have no paragraph breaks (the rich-text stripper collapsed structure); longest is 2 769 chars. Normalise whitespace at codegen; render in a collapsible with a max-height.

**O. 17 smart quotes.** Fine to display; fold them in `searchText` so a straight-quote query matches.

**P. GitHub Pages project subpath.** Assets break without `base`; deep links break under `BrowserRouter` without the `404.html` copy. `HashRouter` removes the second. Ship `.nojekyll` regardless.

**Q. localStorage is origin-scoped, not path-scoped.** Any other project page on the same `*.github.io` shares the store. Namespace the key (`cmmc-sa:v1:assessment`); never a bare `assessment`.

**R. `frame-ancestors` is ignored in a `<meta>` CSP, and GitHub Pages cannot set headers.** Clickjacking protection is genuinely limited — say so on `/about` rather than overclaiming. `connect-src 'none'` is the control that actually delivers the privacy promise.

**S. Export files contain the entire assessment.** Warn on export ("treat this like your SSP") and default to a non-identifying filename unless the user sets an org label.

**T. Never ship `cmmc.sqlite` to the browser.** Its job is to be the test oracle via Node 24's built-in `node:sqlite`.

---

## 10. Non-negotiable framing constraints

- Fully static. No backend, no runtime network calls. localStorage only, with JSON export/import. **Assessment data must never leave the browser.**
- The UI must state prominently that this is an **UNOFFICIAL** tool derived from a public DCMA file, **not affiliated with or endorsed by DCMA or DoD**, and that it is the **Rev 2** catalogue (110 requirements), which Rev 3 restructures.
- No DoD/DCMA seals, logos, or branding anywhere.
- Never imply the computed score is a submission to SPRS.
