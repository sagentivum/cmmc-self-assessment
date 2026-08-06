/** PLAN §7 tests 1-12: catalogue invariants. These gate everything else. */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALL_OBJECTIVES,
  CATALOGUE,
  CATALOGUE_META,
  FAMILIES,
  FAMILY_WEIGHT,
  PARTIAL_ELIGIBLE_IDS,
  compareObjectives,
  objectiveSuffixIndex,
} from '../src/domain/catalogue';
import { EVIDENCE_SLUGS, EVIDENCE_STANDARDS } from '../src/domain/types';
import { MAX_SCORE, MIN_SCORE, TOTAL_WEIGHT } from '../src/scoring/constants';
import { assertCatalogueInvariants } from '../src/scoring/engine';

describe('catalogue invariants', () => {
  it('1: exactly 110 requirements', () => {
    expect(CATALOGUE).toHaveLength(110);
  });

  it('2: exactly 320 objectives, zero orphans, every requirement has >= 1', () => {
    expect(ALL_OBJECTIVES).toHaveLength(320);
    const ids = new Set(CATALOGUE.map((r) => r.requirement));
    for (const o of ALL_OBJECTIVES) expect(ids.has(o.requirement)).toBe(true);
    for (const r of CATALOGUE) expect(r.objectives.length).toBeGreaterThanOrEqual(1);
  });

  it('3: sum of weights === 313', () => {
    expect(CATALOGUE.reduce((n, r) => n + r.weight, 0)).toBe(313);
    expect(TOTAL_WEIGHT).toBe(313);
  });

  it('4: MIN_SCORE === MAX_SCORE - sum(weights) === -203, derived not literal', () => {
    const derived = MAX_SCORE - CATALOGUE.reduce((n, r) => n + r.weight, 0);
    expect(MIN_SCORE).toBe(derived);
    expect(MIN_SCORE).toBe(-203);
  });

  it('5: weights subset of {0,1,3,5}, all >= 0, exactly one zero and it is 3.12.4', () => {
    const dist = new Map<number, number>();
    for (const r of CATALOGUE) {
      expect(r.weight).toBeGreaterThanOrEqual(0);
      expect([0, 1, 3, 5]).toContain(r.weight);
      dist.set(r.weight, (dist.get(r.weight) ?? 0) + 1);
    }
    expect(Object.fromEntries(dist)).toEqual({ 0: 1, 1: 51, 3: 14, 5: 44 });
    expect(CATALOGUE.filter((r) => r.weight === 0).map((r) => r.requirement)).toEqual(['3.12.4']);
    // Gotcha H: weight 0 but 8 objectives.
    expect(CATALOGUE.find((r) => r.requirement === '3.12.4')!.objectives).toHaveLength(8);
  });

  it('6: partial-eligible set is exactly {3.5.3, 3.13.11}, both weight 5 / partial 3', () => {
    expect([...PARTIAL_ELIGIBLE_IDS].sort()).toEqual(['3.13.11', '3.5.3']);
    for (const id of PARTIAL_ELIGIBLE_IDS) {
      const r = CATALOGUE.find((x) => x.requirement === id)!;
      expect(r.weight).toBe(5);
      expect(r.partialWeight).toBe(3);
      // Gotcha I: the DCMA rule text must survive codegen verbatim-ish.
      expect(r.partialRule).toBeTruthy();
    }
  });

  it('7: 14 families; every requirement in exactly one; family weights sum to 313', () => {
    expect(FAMILIES).toHaveLength(14);
    const seen = new Set<string>();
    for (const f of FAMILIES) {
      for (const r of f.requirements) {
        expect(seen.has(r.requirement)).toBe(false);
        seen.add(r.requirement);
      }
    }
    expect(seen.size).toBe(110);
    expect([...FAMILY_WEIGHT.values()].reduce((a, b) => a + b, 0)).toBe(313);
    const byDomain = Object.fromEntries(
      FAMILIES.map((f) => [f.cmmcDomain, FAMILY_WEIGHT.get(f.familyNumber)]),
    );
    expect(byDomain).toEqual({
      AC: 54, SC: 42, CM: 33, SI: 31, IA: 27, MP: 23, AU: 19,
      MA: 18, PE: 14, CA: 13, AT: 11, IR: 11, RA: 9, PS: 8,
    });
  });

  it('8: sort is 1..110 with no gaps or duplicates', () => {
    expect([...CATALOGUE].map((r) => r.sort).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 110 }, (_, i) => i + 1),
    );
  });

  it('9: cmmc_practice domain prefix matches family cmmc_domain for all 110', () => {
    for (const r of CATALOGUE) {
      expect(r.cmmcPractice.split('.')[0]).toBe(r.cmmcDomain);
      expect(r.cmmcPractice.endsWith(`-${r.requirement}`)).toBe(true);
    }
  });

  it('9b: cmmcLevel derived correctly — L1 = 17 reqs / 63 pts, L2 = 93 / 250', () => {
    const l1 = CATALOGUE.filter((r) => r.cmmcLevel === 1);
    const l2 = CATALOGUE.filter((r) => r.cmmcLevel === 2);
    expect(l1).toHaveLength(17);
    expect(l2).toHaveLength(93);
    expect(l1.reduce((n, r) => n + r.weight, 0)).toBe(63);
    expect(l2.reduce((n, r) => n + r.weight, 0)).toBe(250);
  });

  it('10: evidence_standard non-null for all 320, in the 5 values, exact counts', () => {
    const dist = new Map<string, number>();
    for (const o of ALL_OBJECTIVES) {
      expect(o.evidenceStandard).toBeTruthy();
      expect(EVIDENCE_STANDARDS as readonly string[]).toContain(o.evidenceStandard);
      dist.set(o.evidenceStandard, (dist.get(o.evidenceStandard) ?? 0) + 1);
    }
    expect(Object.fromEntries(dist)).toEqual({
      Document: 126,
      'Screen Share': 93,
      Artifact: 82,
      'Physical Review': 18,
      'Artifact and Screen Share': 1,
    });
  });

  it('10b / gotcha K: evidence slugs are the frozen public API set', () => {
    const slugs = new Set(ALL_OBJECTIVES.map((o) => o.evidenceSlug));
    expect([...slugs].sort()).toEqual([...EVIDENCE_SLUGS].sort());
    // Gotcha J: the sole "Artifact and Screen Share" objective is 3.13.11.
    const solo = ALL_OBJECTIVES.filter((o) => o.evidenceSlug === 'artifact-and-screen-share');
    expect(solo).toHaveLength(1);
    expect(solo[0]!.requirement).toBe('3.13.11');
    expect(ALL_OBJECTIVES.filter((o) => o.evidenceSlug === 'physical-review')).toHaveLength(18);
  });

  it('11: objective ids unique; the 23 that equal their requirement id are single-objective', () => {
    const ids = ALL_OBJECTIVES.map((o) => o.objective);
    expect(new Set(ids).size).toBe(320);
    const collisions = ALL_OBJECTIVES.filter((o) => o.objective === o.requirement);
    expect(collisions).toHaveLength(23);
    for (const o of collisions) {
      const req = CATALOGUE.find((r) => r.requirement === o.requirement)!;
      expect(req.objectives).toHaveLength(1);
    }
    // Gotcha B: these ids collide across the two namespaces by design.
    expect(collisions.map((o) => o.objective)).toContain('3.13.11');
  });

  it('12: catalogueHash matches a fresh hash of the committed generated data', () => {
    const canonical = (value: unknown): string => {
      if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
    };
    const hash = createHash('sha256').update(canonical(CATALOGUE)).digest('hex');
    expect(hash).toBe(CATALOGUE_META.catalogueHash);
    expect(CATALOGUE_META.requirementCount).toBe(110);
    expect(CATALOGUE_META.objectiveCount).toBe(320);
    expect(CATALOGUE_META.totalWeight).toBe(313);
  });

  it('12b: generated catalogue is a faithful projection of data/catalogue.json', () => {
    const raw = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../data/catalogue.json'), 'utf8'),
    ) as { requirement: string; weight: number; objectives: unknown[] }[];
    expect(raw).toHaveLength(CATALOGUE.length);
    for (const r of raw) {
      const gen = CATALOGUE.find((x) => x.requirement === r.requirement.trim());
      expect(gen, `missing ${r.requirement}`).toBeDefined();
      expect(gen!.weight).toBe(r.weight);
      expect(gen!.objectives).toHaveLength(r.objectives.length);
    }
  });

  it('assertCatalogueInvariants passes on the real catalogue', () => {
    expect(() => assertCatalogueInvariants(CATALOGUE)).not.toThrow();
  });

  it('assertCatalogueInvariants throws on a mutated catalogue', () => {
    const broken = CATALOGUE.map((r) =>
      r.requirement === '3.1.1' ? { ...r, weight: -1 } : r,
    );
    expect(() => assertCatalogueInvariants(broken)).toThrow(/catalogue invariant violated/);
  });
});

describe('gotcha L: comparators', () => {
  it('requirements are ordered by integer sort, not lexically', () => {
    const ordered = [...CATALOGUE].sort((a, b) => a.sort - b.sort).map((r) => r.requirement);
    const lexical = [...CATALOGUE].map((r) => r.requirement).sort();
    expect(ordered).not.toEqual(lexical);
    expect(ordered.indexOf('3.1.2')).toBeLessThan(ordered.indexOf('3.1.10'));
  });

  it('objective suffix comparator decodes [a]..[o] rather than trusting lexical luck', () => {
    expect(objectiveSuffixIndex('3.1.1[a]')).toBe(1);
    expect(objectiveSuffixIndex('3.1.1[o]')).toBe(15);
    expect(objectiveSuffixIndex('3.13.11')).toBe(-1);
    // Synthetic two-letter suffix would break naive lexical sorting.
    expect(objectiveSuffixIndex('9.9.9[aa]')).toBeGreaterThan(objectiveSuffixIndex('9.9.9[z]'));
    const objs = CATALOGUE.find((r) => r.requirement === '3.1.1')!.objectives;
    const shuffled = [...objs].reverse().sort(compareObjectives);
    expect(shuffled.map((o) => o.objective)).toEqual(objs.map((o) => o.objective));
  });
});

describe('gotcha N/O: text hygiene', () => {
  it('no HTML remnants survive codegen', () => {
    for (const r of CATALOGUE) {
      expect(r.discussion).not.toMatch(/<\/?[a-z]+[^>]*>/i);
      expect(r.description).not.toMatch(/<\/?[a-z]+[^>]*>/i);
    }
  });

  it('double-space runs are collapsed', () => {
    for (const r of CATALOGUE) {
      expect(r.discussion).not.toMatch(/ {2}/);
      expect(r.description).not.toMatch(/ {2}/);
    }
  });

  it('searchText folds smart quotes so a straight-quote query matches', () => {
    const withSmart = CATALOGUE.filter((r) => /[‘’“”]/.test(r.discussion));
    expect(withSmart.length).toBeGreaterThan(0);
    for (const r of CATALOGUE) {
      expect(r.searchText).not.toMatch(/[‘’“”]/);
      expect(r.searchText).toBe(r.searchText.toLowerCase());
    }
  });
});
