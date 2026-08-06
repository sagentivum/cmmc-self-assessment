/** PLAN §7 tests 29-36: state, persistence, export/import. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGUE } from '../src/domain/catalogue';
import { CATALOGUE_META } from '../src/generated/catalogue.meta';
import { scoreAssessment } from '../src/scoring/engine';
import { STORAGE_KEY, DISCLAIMER, emptyAssessment } from '../src/state/schema';
import { buildExport, exportFilename, parseImport } from '../src/state/io';
import { migrateAssessment, sanitise } from '../src/state/migrate';
import { useStore } from '../src/state/store';
import { allStatus, blank, withStatuses } from './helpers';

const reset = () => {
  localStorage.clear();
  useStore.setState({
    assessment: emptyAssessment(CATALOGUE_META.catalogueHash),
    noticeAcknowledged: false,
    lastImport: null,
  });
};

beforeEach(reset);
afterEach(() => vi.restoreAllMocks());

describe('store', () => {
  it('29: round-trips localStorage with version and catalogue hash', async () => {
    useStore.getState().setStatus('3.1.1', 'not-satisfied');
    useStore.getState().acknowledgeNotice();
    // zustand/persist writes synchronously on set
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as {
      version: number;
      state: { assessment: { catalogueHash: string; requirements: Record<string, unknown> } };
    };
    expect(parsed.version).toBe(1);
    expect(parsed.state.assessment.catalogueHash).toBe(CATALOGUE_META.catalogueHash);
    expect(parsed.state.assessment.requirements['3.1.1']).toMatchObject({
      status: 'not-satisfied',
    });

    await useStore.persist.rehydrate();
    expect(useStore.getState().assessment.requirements['3.1.1']!.status).toBe('not-satisfied');
    expect(useStore.getState().noticeAcknowledged).toBe(true);
  });

  it('Q: the storage key is namespaced, not a bare "assessment"', () => {
    expect(STORAGE_KEY).toBe('cmmc-sa:v1:assessment');
    useStore.getState().setStatus('3.1.1', 'satisfied');
    expect(localStorage.getItem('assessment')).toBeNull();
    expect(Object.keys(localStorage)).toContain(STORAGE_KEY);
  });

  it('35: clear() resets to all-unassessed, 110 / 0%', () => {
    useStore.getState().setStatus('3.1.1', 'not-satisfied');
    expect(scoreAssessment(CATALOGUE, useStore.getState().assessment).score).toBe(105);
    useStore.getState().clear();
    const r = scoreAssessment(CATALOGUE, useStore.getState().assessment);
    expect(r.score).toBe(110);
    expect(r.percentComplete).toBe(0);
    expect(r.counts.unassessed).toBe(110);
  });

  it('gotcha B: requirement and objective entries live in separate maps', () => {
    // 3.13.11 exists as BOTH a requirement id and an objective id.
    useStore.getState().setStatus('3.13.11', 'partial');
    useStore.getState().setObjectiveStatus('3.13.11', 'not-satisfied');
    const a = useStore.getState().assessment;
    expect(a.requirements['3.13.11']!.status).toBe('partial');
    expect(a.objectives['3.13.11']!.status).toBe('not-satisfied');
    // And the objective did not leak into the score.
    expect(scoreAssessment(CATALOGUE, a).score).toBe(107);
  });

  it('store refuses partial on a non-eligible requirement rather than throwing at render', () => {
    useStore.getState().setStatus('3.1.1', 'partial');
    expect(useStore.getState().assessment.requirements['3.1.1']).toBeUndefined();
  });

  it('34: localStorage failure degrades to in-memory without throwing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => useStore.getState().setStatus('3.1.2', 'satisfied')).not.toThrow();
    expect(useStore.getState().assessment.requirements['3.1.2']!.status).toBe('satisfied');
    setItem.mockRestore();
    // The flag the UI uses to warn.
    const getItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    useStore.setState({ storageAvailable: false });
    expect(useStore.getState().storageAvailable).toBe(false);
    getItem.mockRestore();
  });
});

describe('export / import', () => {
  it('30: export -> import is state- and score-identical', () => {
    const a = withStatuses({
      '3.1.1': 'not-satisfied',
      '3.5.3': 'partial',
      '3.4.1': 'satisfied',
    });
    a.objectives['3.1.1[a]'] = { status: 'satisfied', prepared: true, updatedAt: a.updatedAt };
    const env = buildExport(a, new Date('2026-02-02T00:00:00Z'));
    const round = parseImport(JSON.stringify(env));
    expect(round.ok).toBe(true);
    expect(round.assessment).toEqual(a);
    expect(scoreAssessment(CATALOGUE, round.assessment!).score).toBe(
      scoreAssessment(CATALOGUE, a).score,
    );
  });

  it('42: the exported envelope embeds the disclaimer', () => {
    const env = buildExport(blank());
    expect(env.disclaimer).toBe(DISCLAIMER);
    expect(env.disclaimer).toMatch(/UNOFFICIAL/);
    expect(env.disclaimer).toMatch(/not affiliated with/i);
    expect(env.disclaimer).toMatch(/Revision 2/);
    expect(env.disclaimer).toMatch(/NOT a submission to SPRS/);
  });

  it('S: filename is non-identifying unless an org label is set', () => {
    const at = new Date('2026-03-04T00:00:00Z');
    expect(exportFilename(blank(), at)).toBe('cmmc-self-assessment-2026-03-04.json');
    const labelled = { ...blank(), orgLabel: 'Acme Widgets, Inc.' };
    expect(exportFilename(labelled, at)).toBe('cmmc-self-assessment-acme-widgets-inc-2026-03-04.json');
  });

  it('31: rejects malformed JSON, newer schemaVersion, and non-object payloads', () => {
    expect(parseImport('{ not json').ok).toBe(false);
    expect(parseImport('{ not json').error).toMatch(/not valid JSON/);
    expect(parseImport('[]').ok).toBe(false);
    expect(parseImport('"hello"').ok).toBe(false);
    expect(parseImport('42').ok).toBe(false);
    expect(parseImport('null').ok).toBe(false);

    const future = { ...blank(), schemaVersion: 99 };
    const r = parseImport(JSON.stringify(future));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/newer version/);

    expect(parseImport(JSON.stringify({ schemaVersion: 1 })).ok).toBe(false);
  });

  it('32: mismatched catalogueHash warns, accepts, drops unknown keys, and reports them', () => {
    const a = withStatuses({ '3.1.1': 'not-satisfied' });
    a.catalogueHash = 'deadbeef';
    a.requirements['9.9.9'] = { status: 'satisfied', poam: false, poamDate: null, updatedAt: a.updatedAt };
    a.objectives['9.9.9[z]'] = { status: 'satisfied', updatedAt: a.updatedAt };
    const r = parseImport(JSON.stringify(a));
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /different catalogue build/.test(w))).toBe(true);
    expect(r.droppedRequirements).toEqual(['9.9.9']);
    expect(r.droppedObjectives).toEqual(['9.9.9[z]']);
    expect(r.warnings.some((w) => w.includes('9.9.9'))).toBe(true);
    expect(r.assessment!.requirements['3.1.1']!.status).toBe('not-satisfied');
    expect(scoreAssessment(CATALOGUE, r.assessment!).score).toBe(105);
  });

  it('32b: an illegal partial in an imported file is normalised, not left to explode', () => {
    const a = withStatuses({ '3.1.1': 'satisfied' });
    a.requirements['3.1.1'] = { status: 'partial', poam: false, poamDate: null, updatedAt: a.updatedAt };
    const r = parseImport(JSON.stringify(a));
    expect(r.ok).toBe(true);
    expect(r.assessment!.requirements['3.1.1']!.status).toBe('not-satisfied');
    expect(() => scoreAssessment(CATALOGUE, r.assessment!)).not.toThrow();
  });

  it('33: unknown ids in persisted state are ignored without crashing', () => {
    const a = allStatus('not-satisfied');
    a.requirements['nope'] = { status: 'not-satisfied', poam: false, poamDate: null, updatedAt: a.updatedAt };
    a.objectives['also-nope'] = { status: 'satisfied', updatedAt: a.updatedAt };
    const clean = sanitise(a);
    expect(clean.requirements['nope']).toBeUndefined();
    expect(clean.objectives['also-nope']).toBeUndefined();
    expect(scoreAssessment(CATALOGUE, clean).score).toBe(-203);

    const migrated = migrateAssessment(a, 1);
    expect(migrated.requirements['nope']).toBeUndefined();
    expect(migrateAssessment('garbage', 1).requirements).toEqual({});
    expect(migrateAssessment(a, 99).requirements).toEqual({});
  });

  it('accepts a bare assessment object as well as the export envelope', () => {
    const a = withStatuses({ '3.1.1': 'not-satisfied' });
    expect(parseImport(JSON.stringify(a)).ok).toBe(true);
    expect(parseImport(JSON.stringify(buildExport(a))).ok).toBe(true);
    expect(parseImport(JSON.stringify({ kind: 'something-else', a: 1 })).ok).toBe(false);
  });
});
