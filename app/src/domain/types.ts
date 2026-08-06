/** Domain types. Mirrors the DCMA DIBCAC public self-assessment database. */

export const EVIDENCE_STANDARDS = [
  'Document',
  'Screen Share',
  'Artifact',
  'Physical Review',
  'Artifact and Screen Share',
] as const;

export type EvidenceStandard = (typeof EVIDENCE_STANDARDS)[number];

/** Gotcha K: slugs are frozen public API — they appear in #/evidence/:slug
 *  deep links. Changing one breaks every bookmark. */
export const EVIDENCE_SLUGS = [
  'document',
  'screen-share',
  'artifact',
  'physical-review',
  'artifact-and-screen-share',
] as const;

export type EvidenceSlug = (typeof EVIDENCE_SLUGS)[number];

/**
 * Gotcha D: the source database stores three independent booleans
 * (Satisfied / Other Than Satisfied / Special Considerations Satisfied) which
 * can contradict each other, and its two scoring queries disagree about what
 * a contradiction means. Modelling status as a single enum makes the
 * contradiction unrepresentable.
 */
export type Status = 'unassessed' | 'satisfied' | 'partial' | 'not-satisfied';

export const STATUSES: readonly Status[] = [
  'unassessed',
  'satisfied',
  'partial',
  'not-satisfied',
] as const;

/** Objectives have no partial state in the source data. */
export type ObjectiveStatus = 'unassessed' | 'satisfied' | 'not-satisfied';

export const OBJECTIVE_STATUSES: readonly ObjectiveStatus[] = [
  'unassessed',
  'satisfied',
  'not-satisfied',
] as const;

export interface Objective {
  /** e.g. "3.1.1[a]".
   *  Gotcha B: for 23 single-objective requirements this string is IDENTICAL
   *  to the requirement id. Never key one map, route param or DOM id on both. */
  readonly objective: string;
  readonly requirement: string;
  readonly text: string;
  readonly evidenceStandard: EvidenceStandard;
  readonly evidenceSlug: string;
  readonly searchText: string;
}

export interface Requirement {
  readonly requirement: string;
  /** 1..110, contiguous. Gotcha L: the only safe sort key. */
  readonly sort: number;
  readonly cmmcPractice: string;
  readonly cmmcLevel: 1 | 2;
  readonly familyNumber: string;
  readonly familyName: string;
  readonly familySort: number;
  readonly cmmcDomain: string;
  readonly description: string;
  readonly discussion: string;
  readonly weight: number;
  /** 3 for exactly 3.5.3 and 3.13.11. null everywhere else. */
  readonly partialWeight: number | null;
  /** Verbatim DCMA text where present (7 requirements). Gotcha I: render as an
   *  attributed quotation, never paraphrase into UI copy. */
  readonly partialRule: string | null;
  readonly objectives: readonly Objective[];
  readonly searchText: string;
}

export interface Family {
  readonly familyNumber: string;
  readonly familyName: string;
  readonly cmmcDomain: string;
  readonly familySort: number;
  readonly requirements: readonly Requirement[];
}

/** Gotcha B: namespaced ids so requirement 3.10.4 and objective 3.10.4 can
 *  never collide in a DOM id, a Set, or a selection model. */
export const reqKey = (id: string): string => `req:${id}`;
export const objKey = (id: string): string => `obj:${id}`;
