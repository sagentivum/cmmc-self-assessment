/** PLAN §7 tests 13-27: the scoring engine. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CATALOGUE, FAMILY_WEIGHT } from '../src/domain/catalogue';
import { MAX_SCORE, MIN_SCORE } from '../src/scoring/constants';
import { deductionFor, scoreAssessment } from '../src/scoring/engine';
import type { Status } from '../src/domain/types';
import { allStatus, blank, withStatuses } from './helpers';

const score = (a: Parameters<typeof scoreAssessment>[1]) => scoreAssessment(CATALOGUE, a).score;
const req = (id: string) => CATALOGUE.find((r) => r.requirement === id)!;

describe('scoring engine', () => {
  it('13: all-unassessed scores 110 with deduction 0 and 0% complete', () => {
    const r = scoreAssessment(CATALOGUE, blank());
    expect(r.score).toBe(110);
    expect(r.totalDeduction).toBe(0);
    expect(r.percentComplete).toBe(0);
    expect(r.counts.unassessed).toBe(110);
  });

  it('14: all-satisfied also scores 110 (gotcha A) — distinguished only by completeness', () => {
    const r = scoreAssessment(CATALOGUE, allStatus('satisfied'));
    expect(r.score).toBe(110);
    expect(r.percentComplete).toBe(100);
    // The trap in one assertion: identical score, different completeness.
    expect(r.score).toBe(scoreAssessment(CATALOGUE, blank()).score);
    expect(r.percentComplete).not.toBe(scoreAssessment(CATALOGUE, blank()).percentComplete);
  });

  it('15: all-not-satisfied scores exactly -203 (the floor)', () => {
    const r = scoreAssessment(CATALOGUE, allStatus('not-satisfied'));
    expect(r.score).toBe(-203);
    expect(r.score).toBe(MIN_SCORE);
    expect(r.totalDeduction).toBe(313);
  });

  it('16: all-not-satisfied with both partials set to partial scores -199', () => {
    const a = allStatus('not-satisfied');
    a.requirements['3.5.3']!.status = 'partial';
    a.requirements['3.13.11']!.status = 'partial';
    expect(score(a)).toBe(-199); // each saves 5 - 3 = 2
  });

  it('17: 3.12.4 (weight 0, 8 objectives) not-satisfied changes the score by 0', () => {
    expect(score(withStatuses({ '3.12.4': 'not-satisfied' }))).toBe(110);
    expect(req('3.12.4').weight).toBe(0);
    expect(req('3.12.4').objectives).toHaveLength(8);
  });

  it('18: one 5-pointer -> 105; one 3 -> 107; one 1 -> 109', () => {
    const five = CATALOGUE.find((r) => r.weight === 5)!;
    const three = CATALOGUE.find((r) => r.weight === 3)!;
    const one = CATALOGUE.find((r) => r.weight === 1)!;
    expect(score(withStatuses({ [five.requirement]: 'not-satisfied' }))).toBe(105);
    expect(score(withStatuses({ [three.requirement]: 'not-satisfied' }))).toBe(107);
    expect(score(withStatuses({ [one.requirement]: 'not-satisfied' }))).toBe(109);
  });

  it('19: partial on 3.5.3 -> 107; on 3.13.11 -> 107; both -> 104', () => {
    expect(score(withStatuses({ '3.5.3': 'partial' }))).toBe(107);
    expect(score(withStatuses({ '3.13.11': 'partial' }))).toBe(107);
    expect(score(withStatuses({ '3.5.3': 'partial', '3.13.11': 'partial' }))).toBe(104);
  });

  it('20: partial on a non-eligible requirement throws, never silently deducts null', () => {
    expect(() => deductionFor(req('3.1.1'), 'partial')).toThrow(/not partial-credit eligible/);
    expect(() => score(withStatuses({ '3.1.1': 'partial' }))).toThrow(
      /not partial-credit eligible/,
    );
    // And is fine on the two that are eligible.
    expect(deductionFor(req('3.5.3'), 'partial')).toBe(3);
    expect(deductionFor(req('3.13.11'), 'partial')).toBe(3);
  });

  it('21: Qry_Summary precedence is honoured — satisfied > OTS > partial > 0', () => {
    // The enum makes contradiction unrepresentable (gotcha D), so precedence is
    // asserted on the cascade itself.
    const p = req('3.13.11');
    expect(deductionFor(p, 'satisfied')).toBe(0);
    expect(deductionFor(p, 'not-satisfied')).toBe(p.weight); // 5
    expect(deductionFor(p, 'partial')).toBe(p.partialWeight); // 3
    expect(deductionFor(p, 'unassessed')).toBe(0); // terminal else-zero
    expect(deductionFor(p, 'not-satisfied')).toBeGreaterThan(deductionFor(p, 'partial'));
  });

  it('25: waterfall starts at 110, ends at score, sums to totalDeduction, non-increasing', () => {
    const a = withStatuses({
      '3.1.1': 'not-satisfied',
      '3.5.3': 'partial',
      '3.13.11': 'partial',
      '3.14.1': 'not-satisfied',
      '3.12.4': 'not-satisfied',
    });
    for (const by of ['domain', 'requirement'] as const) {
      const r = scoreAssessment(CATALOGUE, a, { waterfallBy: by });
      expect(r.waterfall[0]!.runningScore).toBe(110);
      expect(r.waterfall.at(-1)!.runningScore).toBe(r.score);
      expect(r.waterfall.reduce((n, s) => n + s.deduction, 0)).toBe(r.totalDeduction);
      for (let i = 1; i < r.waterfall.length; i += 1) {
        expect(r.waterfall[i]!.runningScore).toBeLessThanOrEqual(r.waterfall[i - 1]!.runningScore);
        expect(r.waterfall[i]!.deduction).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('27: per-domain possibleDeduction matches the fixed family weight table', () => {
    const r = scoreAssessment(CATALOGUE, blank());
    expect(r.byDomain).toHaveLength(14);
    for (const d of r.byDomain) {
      expect(d.possibleDeduction).toBe(FAMILY_WEIGHT.get(d.familyNumber));
    }
    expect(r.byDomain.reduce((n, d) => n + d.possibleDeduction, 0)).toBe(313);
    // Order is family sort order, never lexical (gotcha L).
    expect(r.byDomain.map((d) => d.familyNumber)).toEqual([
      '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7',
      '3.8', '3.9', '3.10', '3.11', '3.12', '3.13', '3.14',
    ]);
  });

  it('36: POA&M overdue is computed from injected now, not Date.now()', () => {
    const a = blank();
    a.requirements['3.1.1'] = {
      status: 'not-satisfied',
      poam: true,
      poamDate: '2025-06-30',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    a.requirements['3.1.2'] = {
      status: 'not-satisfied',
      poam: true,
      poamDate: '2099-01-01',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const before = scoreAssessment(CATALOGUE, a, { now: new Date('2025-01-01T00:00:00Z') });
    expect(before.poamCount).toBe(2);
    expect(before.poamOverdueCount).toBe(0);
    const after = scoreAssessment(CATALOGUE, a, { now: new Date('2026-01-01T00:00:00Z') });
    expect(after.poamOverdueCount).toBe(1);
    expect(after.poam.find((p) => p.requirement === '3.1.1')!.overdue).toBe(true);
  });
});

/* ------------------------------------------------------------- properties */

const legalStatusArb = (partialEligible: boolean) =>
  fc.constantFrom<Status>(
    ...(partialEligible
      ? (['unassessed', 'satisfied', 'partial', 'not-satisfied'] as const)
      : (['unassessed', 'satisfied', 'not-satisfied'] as const)),
  );

const assessmentArb = fc
  .tuple(...CATALOGUE.map((r) => legalStatusArb(r.partialWeight !== null)))
  .map((statuses) =>
    withStatuses(
      Object.fromEntries(CATALOGUE.map((r, i) => [r.requirement, statuses[i]!] as const)),
    ),
  );

describe('scoring properties (fast-check)', () => {
  const RUNS = 5000;

  it('22: score always lands in [-203, 110] with no clamping', () => {
    fc.assert(
      fc.property(assessmentArb, (a) => {
        const s = scoreAssessment(CATALOGUE, a).score;
        return s >= MIN_SCORE && s <= MAX_SCORE;
      }),
      { numRuns: RUNS },
    );
  });

  it('23: score === 110 - sum(deductions), always', () => {
    fc.assert(
      fc.property(assessmentArb, (a) => {
        const r = scoreAssessment(CATALOGUE, a);
        const sum = r.byRequirement.reduce((n, x) => n + x.deduction, 0);
        return r.score === MAX_SCORE - sum && r.totalDeduction === sum;
      }),
      { numRuns: RUNS },
    );
  });

  it('24: sum of domain deductions === totalDeduction, always', () => {
    fc.assert(
      fc.property(assessmentArb, (a) => {
        const r = scoreAssessment(CATALOGUE, a);
        return r.byDomain.reduce((n, d) => n + d.deduction, 0) === r.totalDeduction;
      }),
      { numRuns: RUNS },
    );
  });

  it('26 / gotcha C: randomising all 320 objective statuses never changes the score', () => {
    fc.assert(
      fc.property(
        assessmentArb,
        fc.array(fc.constantFrom('unassessed', 'satisfied', 'not-satisfied'), {
          minLength: 320,
          maxLength: 320,
        }),
        (a, objStatuses) => {
          const baseline = scoreAssessment(CATALOGUE, a);
          const withObjectives = structuredClone(a);
          let i = 0;
          for (const r of CATALOGUE) {
            for (const o of r.objectives) {
              withObjectives.objectives[o.objective] = {
                status: objStatuses[i % 320] as 'satisfied',
                updatedAt: '2026-01-01T00:00:00.000Z',
              };
              i += 1;
            }
          }
          const after = scoreAssessment(CATALOGUE, withObjectives);
          return after.score === baseline.score && after.totalDeduction === baseline.totalDeduction;
        },
      ),
      { numRuns: 300 },
    );
  });

  it('all deductions are non-negative and never exceed the requirement weight', () => {
    fc.assert(
      fc.property(assessmentArb, (a) => {
        const r = scoreAssessment(CATALOGUE, a);
        return r.byRequirement.every((x) => x.deduction >= 0 && x.deduction <= x.weight);
      }),
      { numRuns: 1000 },
    );
  });
});
