/**
 * PLAN §7 test 28 — the oracle.
 *
 * Runs a transliteration of the source database's `Qry_Summary` against
 * data/cmmc.sqlite via Node 24's built-in node:sqlite, over N random
 * assessments, and diffs it against the TypeScript engine.
 *
 * Gotcha T: cmmc.sqlite exists ONLY for this. It is never shipped to a browser.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOGUE } from '../src/domain/catalogue';
import { scoreAssessment } from '../src/scoring/engine';
import type { Status } from '../src/domain/types';
import { randomAssessment, makeRng } from './helpers';

const DB_PATH = resolve(import.meta.dirname, '../../data/cmmc.sqlite');

/**
 * Verbatim structure of Qry_Summary's IIf cascade, in SQLite CASE form:
 *
 *   IIf([Requirement_Satisfied]=True, 0,
 *   IIf([Requirement_Other_Than_Satisfied]=True, [Requirement_Score],
 *   IIf([Requirement_Special_Considerations_Satisfied]=True,
 *       [Requirement_Special_Considerations_Score], 0)))
 */
const QRY_SUMMARY = `
  SELECT f.family_number,
         f.cmmc_domain,
         SUM(CASE
               WHEN a.satisfied = 1 THEN 0
               WHEN a.other_than_satisfied = 1 THEN r.weight
               WHEN a.special_considerations = 1 THEN COALESCE(r.partial_weight, 0)
               ELSE 0
             END) AS total_deducted
  FROM src.requirement r
  JOIN src.family f ON r.family_number = f.family_number
  JOIN asmt a ON a.requirement = r.requirement
  GROUP BY f.family_number, f.cmmc_domain
  ORDER BY f.sort
`;

describe('oracle: transliterated Qry_Summary vs the TS engine', () => {
  let db: DatabaseSync;

  beforeAll(() => {
    expect(existsSync(DB_PATH), `oracle db missing at ${DB_PATH}`).toBe(true);
    // main is in-memory (holds the per-iteration assessment flags); the oracle
    // file is ATTACHed and only ever read from. Nothing writes to src.*.
    db = new DatabaseSync(':memory:');
    db.exec(`ATTACH DATABASE '${DB_PATH.replace(/'/g, "''")}' AS src`);
    db.exec(`CREATE TABLE asmt (
      requirement TEXT PRIMARY KEY,
      satisfied INTEGER NOT NULL,
      other_than_satisfied INTEGER NOT NULL,
      special_considerations INTEGER NOT NULL
    )`);
  });

  const loadFlags = (statuses: Map<string, Status>): void => {
    db.exec('DELETE FROM asmt');
    const ins = db.prepare(
      'INSERT INTO asmt (requirement, satisfied, other_than_satisfied, special_considerations) VALUES (?,?,?,?)',
    );
    for (const r of CATALOGUE) {
      const s = statuses.get(r.requirement) ?? 'unassessed';
      ins.run(
        r.requirement,
        s === 'satisfied' ? 1 : 0,
        s === 'not-satisfied' ? 1 : 0,
        s === 'partial' ? 1 : 0,
      );
    }
  };

  const oracleRun = (): { total: number; byFamily: Map<string, number> } => {
    const rows = db.prepare(QRY_SUMMARY).all() as {
      family_number: string;
      total_deducted: number;
    }[];
    const byFamily = new Map(rows.map((r) => [r.family_number, Number(r.total_deducted)]));
    return { total: [...byFamily.values()].reduce((a, b) => a + b, 0), byFamily };
  };

  it('agrees on 500 random assessments — total, score, and per-family deduction', () => {
    const rng = makeRng(0xc11c);
    for (let i = 0; i < 500; i += 1) {
      const assessment = randomAssessment(rng);
      const statuses = new Map<string, Status>(
        Object.entries(assessment.requirements).map(([k, v]) => [k, v.status]),
      );
      loadFlags(statuses);
      const oracle = oracleRun();
      const ts = scoreAssessment(CATALOGUE, assessment);

      expect(ts.totalDeduction, `iteration ${i} total`).toBe(oracle.total);
      expect(ts.score, `iteration ${i} score`).toBe(110 - oracle.total);
      for (const d of ts.byDomain) {
        expect(d.deduction, `iteration ${i} family ${d.familyNumber}`).toBe(
          oracle.byFamily.get(d.familyNumber) ?? 0,
        );
      }
    }
  });

  it('agrees on the three canonical extremes', () => {
    const cases: { name: string; make: () => Map<string, Status> }[] = [
      { name: 'all unassessed', make: () => new Map() },
      {
        name: 'all satisfied',
        make: () => new Map(CATALOGUE.map((r) => [r.requirement, 'satisfied' as Status])),
      },
      {
        name: 'all not satisfied',
        make: () => new Map(CATALOGUE.map((r) => [r.requirement, 'not-satisfied' as Status])),
      },
    ];
    const expected = [110, 110, -203];
    cases.forEach((c, i) => {
      const statuses = c.make();
      loadFlags(statuses);
      const oracle = oracleRun();
      expect(110 - oracle.total, c.name).toBe(expected[i]);
    });
  });

  it('the oracle db itself still reports the facts the plan was verified against', () => {
    const one = <T>(sql: string): T => db.prepare(sql).get() as T;
    expect(one<{ c: number }>('SELECT COUNT(*) c FROM src.requirement').c).toBe(110);
    expect(one<{ c: number }>('SELECT COUNT(*) c FROM src.objective').c).toBe(320);
    expect(one<{ s: number }>('SELECT SUM(weight) s FROM src.requirement').s).toBe(313);
    expect(
      one<{ c: number }>('SELECT COUNT(*) c FROM src.requirement WHERE partial_weight IS NOT NULL').c,
    ).toBe(2);
  });
});
