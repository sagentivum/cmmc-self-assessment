import { CATALOGUE } from '../generated/catalogue';
import { CATALOGUE_META } from '../generated/catalogue.meta';
import type { Family, Objective, Requirement } from './types';

export { CATALOGUE, CATALOGUE_META };

/**
 * Gotcha L: dotted-decimal ids sort wrong lexically ("3.1.10" < "3.1.2").
 * Requirements and families are always ordered by their integer `sort`.
 */
export function compareRequirements(a: Requirement, b: Requirement): number {
  return a.sort - b.sort;
}

/**
 * Objective suffixes happen to be single letters [a]–[o], so lexical ordering
 * is currently correct — but relying on a coincidence is how bugs get in.
 * This comparator sorts by requirement `sort`, then by the decoded suffix
 * index, and is covered by a test.
 */
export function objectiveSuffixIndex(objectiveId: string): number {
  const m = /\[([a-z]+)\]$/i.exec(objectiveId);
  if (!m) return -1; // the 23 bare ids that equal their requirement id
  const letters = m[1]!.toLowerCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 96);
  return n;
}

export function compareObjectives(a: Objective, b: Objective): number {
  const ra = REQUIREMENT_BY_ID.get(a.requirement)?.sort ?? 0;
  const rb = REQUIREMENT_BY_ID.get(b.requirement)?.sort ?? 0;
  if (ra !== rb) return ra - rb;
  return objectiveSuffixIndex(a.objective) - objectiveSuffixIndex(b.objective);
}

export const REQUIREMENT_BY_ID: ReadonlyMap<string, Requirement> = new Map(
  CATALOGUE.map((r) => [r.requirement, r]),
);

export const ALL_OBJECTIVES: readonly Objective[] = Object.freeze(
  CATALOGUE.flatMap((r) => r.objectives),
);

export const OBJECTIVE_BY_ID: ReadonlyMap<string, Objective> = new Map(
  ALL_OBJECTIVES.map((o) => [o.objective, o]),
);

export const FAMILIES: readonly Family[] = Object.freeze(
  [...new Map(CATALOGUE.map((r) => [r.familyNumber, r])).values()]
    .sort((a, b) => a.familySort - b.familySort)
    .map((head) =>
      Object.freeze({
        familyNumber: head.familyNumber,
        familyName: head.familyName,
        cmmcDomain: head.cmmcDomain,
        familySort: head.familySort,
        requirements: Object.freeze(
          CATALOGUE.filter((r) => r.familyNumber === head.familyNumber).sort(compareRequirements),
        ),
      }),
    ),
);

export const FAMILY_BY_NUMBER: ReadonlyMap<string, Family> = new Map(
  FAMILIES.map((f) => [f.familyNumber, f]),
);

/** Fixed per-family possible deduction (family weight). Sums to 313. */
export const FAMILY_WEIGHT: ReadonlyMap<string, number> = new Map(
  FAMILIES.map((f) => [f.familyNumber, f.requirements.reduce((n, r) => n + r.weight, 0)]),
);

/** Requirements that may be marked `partial` — exactly 3.5.3 and 3.13.11. */
export function isPartialEligible(req: Requirement): boolean {
  return req.partialWeight !== null;
}

export const PARTIAL_ELIGIBLE_IDS: readonly string[] = Object.freeze(
  CATALOGUE.filter(isPartialEligible).map((r) => r.requirement),
);
