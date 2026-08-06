/**
 * Pure scoring engine. No React, no store, no Date.now(), no localStorage.
 *
 * Transliterates Qry_Summary from the source database:
 *
 *   IIf([Requirement_Satisfied]=True, 0,
 *   IIf([Requirement_Other_Than_Satisfied]=True, [Requirement_Score],
 *   IIf([Requirement_Special_Considerations_Satisfied]=True,
 *       [Requirement_Special_Considerations_Score], 0)))
 *
 * — a FOUR-way cascade with a terminal else-zero, not a three-way one.
 * score = 110 - Σ TotalDeducted.
 *
 * No defensive clamping. The score must land in [MIN_SCORE, MAX_SCORE]
 * naturally; Math.min/max would hide a real bug. Property tests prove it.
 */
import { FAMILIES, FAMILY_WEIGHT, compareRequirements } from '../domain/catalogue';
import type { Requirement, Status } from '../domain/types';
import { STATUSES } from '../domain/types';
import { MAX_SCORE, MIN_SCORE, TOTAL_WEIGHT } from './constants';
import type { Assessment } from '../state/schema';

const isDev = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
};

/**
 * Single-requirement deduction. Returns a NON-NEGATIVE number of points removed.
 * Throws if `partial` is used on a requirement with no partialWeight, rather
 * than silently deducting `null` (which Access would have coerced to 0).
 */
export function deductionFor(req: Requirement, status: Status): number {
  // satisfied ≻ other-than-satisfied ≻ special-considerations ≻ 0
  if (status === 'satisfied') return 0;
  if (status === 'not-satisfied') return req.weight;
  if (status === 'partial') {
    if (req.partialWeight === null) {
      throw new Error(
        `Requirement ${req.requirement} is not partial-credit eligible ` +
          `(only ${'3.5.3'} and ${'3.13.11'} carry a partial weight).`,
      );
    }
    return req.partialWeight;
  }
  return 0; // 'unassessed' — the terminal else-zero. See gotcha A.
}

export interface RequirementScore {
  requirement: string;
  status: Status;
  weight: number;
  partialWeight: number | null;
  partialEligible: boolean;
  deduction: number;
  /** Points still exposed: the full weight, if not yet satisfied. */
  pointsAtRisk: number;
}

export interface DomainScore {
  familyNumber: string;
  familyName: string;
  cmmcDomain: string;
  requirementCount: number;
  possibleDeduction: number;
  deduction: number;
  assessedCount: number;
  counts: Record<Status, number>;
}

export interface WaterfallStep {
  key: string;
  label: string;
  deduction: number;
  runningScore: number;
}

export interface PoamEntry {
  requirement: string;
  cmmcPractice: string;
  familyName: string;
  weight: number;
  status: Status;
  poamDate: string | null;
  overdue: boolean;
}

export interface ScoreResult {
  score: number;
  totalDeduction: number;
  maxScore: number;
  minScore: number;
  totalWeight: number;
  requirementCount: number;
  assessedCount: number;
  percentComplete: number;
  counts: Record<Status, number>;
  byRequirement: readonly RequirementScore[];
  byDomain: readonly DomainScore[];
  waterfall: readonly WaterfallStep[];
  poam: readonly PoamEntry[];
  poamCount: number;
  poamOverdueCount: number;
}

function zeroCounts(): Record<Status, number> {
  return { unassessed: 0, satisfied: 0, partial: 0, 'not-satisfied': 0 };
}

export interface ScoreOptions {
  now?: Date;
  waterfallBy?: 'domain' | 'requirement';
}

export function scoreAssessment(
  catalogue: readonly Requirement[],
  assessment: Assessment,
  opts: ScoreOptions = {},
): ScoreResult {
  const now = opts.now ?? new Date(0);
  const waterfallBy = opts.waterfallBy ?? 'domain';

  const ordered = [...catalogue].sort(compareRequirements);
  const counts = zeroCounts();
  const byRequirement: RequirementScore[] = [];
  const poam: PoamEntry[] = [];

  let totalDeduction = 0;
  let assessedCount = 0;

  for (const req of ordered) {
    const entry = assessment.requirements[req.requirement];
    const status: Status = entry?.status ?? 'unassessed';
    const deduction = deductionFor(req, status);
    totalDeduction += deduction;
    counts[status] += 1;
    if (status !== 'unassessed') assessedCount += 1;

    byRequirement.push({
      requirement: req.requirement,
      status,
      weight: req.weight,
      partialWeight: req.partialWeight,
      partialEligible: req.partialWeight !== null,
      deduction,
      pointsAtRisk: status === 'satisfied' ? 0 : req.weight,
    });

    if (entry?.poam) {
      const poamDate = entry.poamDate ?? null;
      poam.push({
        requirement: req.requirement,
        cmmcPractice: req.cmmcPractice,
        familyName: req.familyName,
        weight: req.weight,
        status,
        poamDate,
        // Gotcha / test 36: overdue is computed from the INJECTED `now`.
        overdue: poamDate !== null && poamDate !== '' && new Date(`${poamDate}T23:59:59`) < now,
      });
    }
  }

  const score = MAX_SCORE - totalDeduction;

  if (isDev() && (score > MAX_SCORE || score < MIN_SCORE)) {
    throw new Error(
      `scoreAssessment produced ${score}, outside [${MIN_SCORE}, ${MAX_SCORE}]. ` +
        `This is a bug in the engine or the catalogue, not something to clamp.`,
    );
  }

  const deductionByReq = new Map(byRequirement.map((r) => [r.requirement, r]));

  const byDomain: DomainScore[] = FAMILIES.map((family) => {
    const familyReqs = family.requirements.filter((r) =>
      deductionByReq.has(r.requirement),
    );
    const c = zeroCounts();
    let deduction = 0;
    let assessed = 0;
    for (const r of familyReqs) {
      const rs = deductionByReq.get(r.requirement)!;
      deduction += rs.deduction;
      c[rs.status] += 1;
      if (rs.status !== 'unassessed') assessed += 1;
    }
    return {
      familyNumber: family.familyNumber,
      familyName: family.familyName,
      cmmcDomain: family.cmmcDomain,
      requirementCount: familyReqs.length,
      possibleDeduction: familyReqs.reduce((n, r) => n + r.weight, 0),
      deduction,
      assessedCount: assessed,
      counts: c,
    };
  }).filter((d) => d.requirementCount > 0);

  const waterfall: WaterfallStep[] = [];
  let running = MAX_SCORE;
  waterfall.push({ key: 'start', label: 'Starting score', deduction: 0, runningScore: running });
  if (waterfallBy === 'domain') {
    for (const d of byDomain) {
      running -= d.deduction;
      waterfall.push({
        key: d.familyNumber,
        label: `${d.cmmcDomain} — ${titleCase(d.familyName)}`,
        deduction: d.deduction,
        runningScore: running,
      });
    }
  } else {
    for (const r of byRequirement) {
      if (r.deduction === 0) continue;
      running -= r.deduction;
      waterfall.push({
        key: r.requirement,
        label: r.requirement,
        deduction: r.deduction,
        runningScore: running,
      });
    }
  }

  return {
    score,
    totalDeduction,
    maxScore: MAX_SCORE,
    minScore: MIN_SCORE,
    totalWeight: TOTAL_WEIGHT,
    requirementCount: ordered.length,
    assessedCount,
    // Gotcha F: do NOT port Qry_Percent_Requirements_Complete — it sums three
    // booleans that can both be set and double-counts. Compute from the enum.
    percentComplete: ordered.length === 0 ? 0 : (assessedCount / ordered.length) * 100,
    counts,
    byRequirement,
    byDomain,
    waterfall,
    poam,
    poamCount: poam.length,
    poamOverdueCount: poam.filter((p) => p.overdue).length,
  };
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w === 'and' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Throws with a specific message on any violation. Used by tests and dev boot. */
export function assertCatalogueInvariants(catalogue: readonly Requirement[]): void {
  const fail = (msg: string): never => {
    throw new Error(`catalogue invariant violated: ${msg}`);
  };

  if (catalogue.length !== 110) fail(`expected 110 requirements, got ${catalogue.length}`);

  const sorts = catalogue.map((r) => r.sort).sort((a, b) => a - b);
  for (let i = 0; i < sorts.length; i += 1) {
    if (sorts[i] !== i + 1) fail(`sort is not 1..110 contiguous (index ${i} is ${sorts[i]})`);
  }

  const ids = new Set(catalogue.map((r) => r.requirement));
  if (ids.size !== catalogue.length) fail('duplicate requirement ids');

  let objectiveCount = 0;
  const objIds = new Set<string>();
  for (const r of catalogue) {
    if (r.objectives.length === 0) fail(`${r.requirement} has no objectives`);
    for (const o of r.objectives) {
      objectiveCount += 1;
      if (objIds.has(o.objective)) fail(`duplicate objective id ${o.objective}`);
      objIds.add(o.objective);
      if (o.requirement !== r.requirement) fail(`orphan objective ${o.objective}`);
    }
  }
  if (objectiveCount !== 320) fail(`expected 320 objectives, got ${objectiveCount}`);

  const total = catalogue.reduce((n, r) => n + r.weight, 0);
  if (total !== 313) fail(`Σ weights expected 313, got ${total}`);
  if (MIN_SCORE !== MAX_SCORE - total) fail(`MIN_SCORE ${MIN_SCORE} != ${MAX_SCORE - total}`);

  for (const r of catalogue) {
    // Gotcha E: the source used Sum(Abs(...)). Ours are all positive, so a
    // future sign flip must fail loudly here rather than be silently absorbed.
    if (r.weight < 0) fail(`${r.requirement} has negative weight ${r.weight}`);
    if (![0, 1, 3, 5].includes(r.weight)) fail(`${r.requirement} has weight ${r.weight} ∉ {0,1,3,5}`);
  }

  const zeroWeight = catalogue.filter((r) => r.weight === 0).map((r) => r.requirement);
  if (zeroWeight.length !== 1 || zeroWeight[0] !== '3.12.4') {
    fail(`expected exactly one weight-0 requirement (3.12.4), got ${JSON.stringify(zeroWeight)}`);
  }

  const partials = catalogue.filter((r) => r.partialWeight !== null).map((r) => r.requirement);
  if (partials.length !== 2 || !partials.includes('3.5.3') || !partials.includes('3.13.11')) {
    fail(`partial-eligible set must be {3.5.3, 3.13.11}, got ${JSON.stringify(partials)}`);
  }
  for (const id of partials) {
    const r = catalogue.find((x) => x.requirement === id)!;
    if (r.weight !== 5 || r.partialWeight !== 3) {
      fail(`${id} must be weight 5 / partial 3, got ${r.weight}/${String(r.partialWeight)}`);
    }
  }

  const familyNumbers = new Set(catalogue.map((r) => r.familyNumber));
  if (familyNumbers.size !== 14) fail(`expected 14 families, got ${familyNumbers.size}`);
  const familySum = [...FAMILY_WEIGHT.values()].reduce((a, b) => a + b, 0);
  if (familySum !== 313) fail(`family weights sum to ${familySum}, expected 313`);

  for (const r of catalogue) {
    const prefix = r.cmmcPractice.split('.')[0];
    if (prefix !== r.cmmcDomain) {
      fail(`${r.requirement}: practice prefix ${String(prefix)} != domain ${r.cmmcDomain}`);
    }
  }

  for (const s of STATUSES) {
    if (typeof s !== 'string') fail('status enum corrupted');
  }
}
