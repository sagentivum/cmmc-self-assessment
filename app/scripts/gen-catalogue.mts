/**
 * Codegen: data/catalogue.json  ->  src/generated/catalogue.ts + catalogue.meta.ts
 *
 * The catalogue is compiled INTO the JS bundle rather than fetched at runtime.
 * That is a deliberate privacy/robustness choice: it makes "zero runtime network
 * calls" literally true and removes the whole base-URL-for-fetch bug class on a
 * GitHub Pages project subpath.
 *
 * Runs as `prebuild` and `pretest`. Zod-validates the source shape so silent
 * upstream drift fails the build rather than the UI.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '..');
const SOURCE = resolve(APP, '../data/catalogue.json');
const OUT_DIR = resolve(APP, 'src/generated');

/* ------------------------------------------------------------------ schema */

const EVIDENCE_STANDARDS = [
  'Document',
  'Screen Share',
  'Artifact',
  'Physical Review',
  'Artifact and Screen Share',
] as const;

const RawObjective = z
  .object({
    objective: z.string().min(1),
    text: z.string().min(1),
    evidence_standard: z.enum(EVIDENCE_STANDARDS),
  })
  .strict();

const RawRequirement = z
  .object({
    requirement: z.string().min(1),
    sort: z.number().int().positive(),
    cmmc_practice: z.string().min(1),
    family_number: z.string().min(1),
    family_name: z.string().min(1),
    cmmc_domain: z.string().min(1),
    description: z.string().min(1),
    discussion: z.string(),
    weight: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)]),
    partial_weight: z.number().int().nonnegative().nullable(),
    partial_rule: z.string().nullable(),
    objectives: z.array(RawObjective).min(1),
  })
  .strict();

const RawCatalogue = z.array(RawRequirement).min(1);

/* ------------------------------------------------------------- normalising */

/** Gotcha N: 103/110 discussions are unbroken walls of text and 53 carry
 *  double-space runs left by the rich-text stripper. Collapse runs of
 *  whitespace, but keep newlines as paragraph separators where they exist. */
function normaliseText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Gotcha O: 17 smart quotes. Keep them for display; fold them here so a
 *  straight-quote search query still matches. */
function fold(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Gotcha K: evidence values contain spaces; the slug becomes frozen public
 *  API via #/evidence/:slug deep links. Test 10/K locks these five values. */
function evidenceSlug(standard: string): string {
  return standard.toLowerCase().replace(/\s+/g, '-');
}

/** "AC.L1-3.1.1" -> 1 */
function cmmcLevel(practice: string): 1 | 2 {
  const m = /\.L(\d)-/.exec(practice);
  if (!m) throw new Error(`cannot derive CMMC level from practice "${practice}"`);
  const n = Number(m[1]);
  if (n !== 1 && n !== 2) throw new Error(`unexpected CMMC level ${n} in "${practice}"`);
  return n;
}

/** Gotcha L: "3.1.10" < "3.1.2" lexically. Family sort is the integer after
 *  the leading "3." — verified to match the source family sort exactly. */
function familySort(familyNumber: string): number {
  const m = /^3\.(\d+)$/.exec(familyNumber);
  if (!m) throw new Error(`unexpected family number "${familyNumber}"`);
  return Number(m[1]);
}

/* --------------------------------------------------------------- canonical */

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/* -------------------------------------------------------------------- main */

const rawText = readFileSync(SOURCE, 'utf8');
const parsed = RawCatalogue.safeParse(JSON.parse(rawText));
if (!parsed.success) {
  console.error('catalogue.json failed schema validation:');
  console.error(JSON.stringify(parsed.error.issues.slice(0, 20), null, 2));
  process.exit(1);
}

const requirements = [...parsed.data].sort((a, b) => a.sort - b.sort).map((r) => {
  const description = normaliseText(r.description);
  const discussion = normaliseText(r.discussion);
  const partialRule = r.partial_rule === null ? null : normaliseText(r.partial_rule);
  const objectives = r.objectives.map((o) => {
    const text = normaliseText(o.text);
    return {
      objective: o.objective.trim(),
      requirement: r.requirement.trim(),
      text,
      evidenceStandard: o.evidence_standard,
      evidenceSlug: evidenceSlug(o.evidence_standard),
      searchText: fold(`${o.objective} ${text} ${o.evidence_standard}`),
    };
  });
  return {
    requirement: r.requirement.trim(),
    sort: r.sort,
    cmmcPractice: r.cmmc_practice.trim(),
    cmmcLevel: cmmcLevel(r.cmmc_practice),
    familyNumber: r.family_number.trim(),
    familyName: r.family_name.trim(),
    familySort: familySort(r.family_number.trim()),
    cmmcDomain: r.cmmc_domain.trim(),
    description,
    discussion,
    weight: r.weight,
    partialWeight: r.partial_weight,
    partialRule,
    objectives,
    searchText: fold(
      `${r.requirement} ${r.cmmc_practice} ${r.family_name} ${description} ${discussion}`,
    ),
  };
});

const catalogueHash = createHash('sha256').update(canonical(requirements)).digest('hex');
const objectiveCount = requirements.reduce((n, r) => n + r.objectives.length, 0);
const totalWeight = requirements.reduce((n, r) => n + r.weight, 0);
const families = [...new Set(requirements.map((r) => r.familyNumber))];

mkdirSync(OUT_DIR, { recursive: true });

const banner = `// GENERATED BY scripts/gen-catalogue.mts — DO NOT EDIT.
// Source: data/catalogue.json (derived from the DCMA DIBCAC public
// NIST SP 800-171 Rev 2 self-assessment Access database, v1.1).
// Regenerate with \`pnpm run gen\`. CI asserts regeneration is a no-op.
`;

writeFileSync(
  resolve(OUT_DIR, 'catalogue.ts'),
  `${banner}
import type { Requirement } from '../domain/types';

export const CATALOGUE: readonly Requirement[] = Object.freeze(
  ${JSON.stringify(requirements, null, 2).replace(/\n/g, '\n  ')} as const satisfies readonly Requirement[],
);
`,
  'utf8',
);

writeFileSync(
  resolve(OUT_DIR, 'catalogue.meta.ts'),
  `${banner}
export const CATALOGUE_META = Object.freeze({
  sourceFile: 'data/catalogue.json',
  sourceDatabase: 'Public_800-171_Self_Asmt_DB_v1.1.accdb (DCMA DIBCAC, public release)',
  revision: 'NIST SP 800-171 Revision 2',
  catalogueHash: ${JSON.stringify(catalogueHash)},
  requirementCount: ${requirements.length},
  objectiveCount: ${objectiveCount},
  familyCount: ${families.length},
  totalWeight: ${totalWeight},
  generatedFrom: 'scripts/gen-catalogue.mts',
} as const);
`,
  'utf8',
);

console.log(
  `gen-catalogue: ${requirements.length} requirements, ${objectiveCount} objectives, ` +
    `${families.length} families, Σweight ${totalWeight}, hash ${catalogueHash.slice(0, 12)}…`,
);
