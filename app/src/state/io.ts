import { CATALOGUE, REQUIREMENT_BY_ID, OBJECTIVE_BY_ID } from '../domain/catalogue';
import { CATALOGUE_META } from '../generated/catalogue.meta';
import {
  DISCLAIMER,
  SCHEMA_VERSION,
  assessmentSchema,
  exportEnvelopeSchema,
  type Assessment,
  type ExportEnvelope,
} from './schema';

export interface ImportResult {
  ok: boolean;
  assessment?: Assessment;
  /** Non-fatal problems the user must be told about. */
  warnings: string[];
  error?: string;
  droppedRequirements: string[];
  droppedObjectives: string[];
}

export function buildExport(assessment: Assessment, now: Date = new Date()): ExportEnvelope {
  return {
    kind: 'cmmc-self-assessment-export',
    exportedAt: now.toISOString(),
    // Test 42: the disclaimer travels inside the exported JSON, not just the UI.
    disclaimer: DISCLAIMER,
    assessment,
  };
}

/** Gotcha S: an export file is effectively your SSP. Default to a
 *  non-identifying filename unless the user has set an org label. */
export function exportFilename(assessment: Assessment, now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  const label = assessment.orgLabel?.trim();
  const slug = label
    ? label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
    : '';
  return slug ? `cmmc-self-assessment-${slug}-${stamp}.json` : `cmmc-self-assessment-${stamp}.json`;
}

function coerceLegacy(raw: unknown): unknown {
  // Accept either a bare Assessment or the export envelope.
  if (raw !== null && typeof raw === 'object' && 'assessment' in raw) {
    return (raw as { assessment: unknown }).assessment;
  }
  return raw;
}

export function parseImport(text: string): ImportResult {
  const warnings: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.', warnings, droppedRequirements: [], droppedObjectives: [] };
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return {
      ok: false,
      error: 'That file does not contain an assessment object.',
      warnings,
      droppedRequirements: [],
      droppedObjectives: [],
    };
  }

  if ('kind' in json) {
    const env = exportEnvelopeSchema.safeParse(json);
    if (!env.success && (json as { kind?: unknown }).kind !== 'cmmc-self-assessment-export') {
      return {
        ok: false,
        error: 'That file is not a CMMC self-assessment export.',
        warnings,
        droppedRequirements: [],
        droppedObjectives: [],
      };
    }
  }

  const candidate = coerceLegacy(json) as Record<string, unknown>;
  const version = candidate?.['schemaVersion'];
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `That file was written by a newer version of this tool (schema v${version}). Update the app, or export again from the older version.`,
      warnings,
      droppedRequirements: [],
      droppedObjectives: [],
    };
  }

  const parsed = assessmentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: `That file is not a valid assessment: ${parsed.error.issues[0]?.message ?? 'unknown shape'}.`,
      warnings,
      droppedRequirements: [],
      droppedObjectives: [],
    };
  }

  const assessment = parsed.data;

  if (assessment.catalogueHash !== CATALOGUE_META.catalogueHash) {
    warnings.push(
      'This file was created against a different catalogue build. It has been imported, but ' +
        'entries that no longer match a requirement were dropped.',
    );
  }

  // Test 32/33: drop unknown keys rather than crashing, and say what was dropped.
  const droppedRequirements: string[] = [];
  const droppedObjectives: string[] = [];
  const requirements: Assessment['requirements'] = {};
  for (const [id, entry] of Object.entries(assessment.requirements)) {
    if (REQUIREMENT_BY_ID.has(id)) requirements[id] = entry;
    else droppedRequirements.push(id);
  }
  const objectives: Assessment['objectives'] = {};
  for (const [id, entry] of Object.entries(assessment.objectives)) {
    if (OBJECTIVE_BY_ID.has(id)) objectives[id] = entry;
    else droppedObjectives.push(id);
  }

  // A `partial` status on a requirement that cannot take partial credit would
  // make the engine throw. Normalise it rather than exploding at render time.
  for (const [id, entry] of Object.entries(requirements)) {
    if (entry.status === 'partial' && REQUIREMENT_BY_ID.get(id)!.partialWeight === null) {
      requirements[id] = { ...entry, status: 'not-satisfied' };
      warnings.push(
        `${id} was marked "partial" but is not partial-credit eligible; it was imported as "not satisfied".`,
      );
    }
  }

  if (droppedRequirements.length > 0) {
    warnings.push(
      `Dropped ${droppedRequirements.length} unknown requirement id(s): ${droppedRequirements.slice(0, 5).join(', ')}${droppedRequirements.length > 5 ? '…' : ''}`,
    );
  }
  if (droppedObjectives.length > 0) {
    warnings.push(
      `Dropped ${droppedObjectives.length} unknown objective id(s): ${droppedObjectives.slice(0, 5).join(', ')}${droppedObjectives.length > 5 ? '…' : ''}`,
    );
  }

  return {
    ok: true,
    assessment: { ...assessment, requirements, objectives },
    warnings,
    droppedRequirements,
    droppedObjectives,
  };
}

/**
 * Mirrors the source database's `Qry_OTS`: every assessment objective marked
 * other-than-satisfied, ordered family → requirement → objective, with the
 * requirement's deduction alongside.
 *
 * One deliberate divergence: Qry_OTS computes TotalDeducted as
 * `IIf(SpecialConsiderations, SC_Points, Points)` — it never checks Satisfied,
 * so a row flagged both Satisfied and OTS still deducts there (gotcha D).
 * Our single-enum model makes that state unrepresentable, so this export uses
 * the same deduction the score uses.
 */
export function otsExportCsv(assessment: Assessment): string {
  const esc = (v: string | number | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows: string[] = [
    [
      'family_number',
      'family_name',
      'requirement',
      'cmmc_practice',
      'requirement_description',
      'points',
      'special_consideration_points',
      'deducted',
      'requirement_status',
      'objective',
      'objective_text',
      'evidence_standard',
      'poam',
      'poam_date',
    ].join(','),
  ];
  for (const r of CATALOGUE) {
    const entry = assessment.requirements[r.requirement];
    const status = entry?.status ?? 'unassessed';
    const deducted =
      status === 'not-satisfied' ? r.weight : status === 'partial' ? (r.partialWeight ?? 0) : 0;
    for (const o of r.objectives) {
      if (assessment.objectives[o.objective]?.status !== 'not-satisfied') continue;
      rows.push(
        [
          r.familyNumber,
          r.familyName,
          r.requirement,
          r.cmmcPractice,
          r.description,
          r.weight,
          r.partialWeight,
          deducted,
          status,
          o.objective,
          o.text,
          o.evidenceStandard,
          entry?.poam ? 'yes' : 'no',
          entry?.poamDate ?? null,
        ]
          .map(esc)
          .join(','),
      );
    }
  }
  return rows.join('\n');
}

/** Gotcha G: this list is built from evidence_standard + the objective text,
 *  which the source database DOES contain. There is no "typical questions
 *  asked" data anywhere in Tbl_Objectives — do not invent it. */
export function evidenceRequestText(assessment: Assessment, now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push('EVIDENCE REQUEST LIST');
  lines.push(`Generated ${now.toISOString().slice(0, 10)} by an unofficial self-assessment tool.`);
  lines.push(DISCLAIMER);
  lines.push('');
  lines.push(
    'Scope: assessment objectives belonging to requirements that are currently ' +
      'NOT SATISFIED or UNASSESSED.',
  );
  lines.push('');
  for (const r of CATALOGUE) {
    const status = assessment.requirements[r.requirement]?.status ?? 'unassessed';
    if (status === 'satisfied') continue;
    lines.push(`${r.cmmcPractice}  (${r.requirement}) — ${status.replace('-', ' ')}`);
    lines.push(`  ${r.description}`);
    for (const o of r.objectives) {
      const prepared = assessment.objectives[o.objective]?.prepared ? '[x]' : '[ ]';
      lines.push(`  ${prepared} ${o.objective}  <${o.evidenceStandard}>  ${o.text}`);
      const note = assessment.objectives[o.objective]?.evidenceNote?.trim();
      if (note) lines.push(`        note: ${note}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
