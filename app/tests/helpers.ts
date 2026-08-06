import { CATALOGUE } from '../src/domain/catalogue';
import type { ObjectiveStatus, Status } from '../src/domain/types';
import type { Assessment } from '../src/state/schema';
import { emptyAssessment } from '../src/state/schema';
import { CATALOGUE_META } from '../src/generated/catalogue.meta';

const NOW = new Date('2026-01-01T00:00:00.000Z');

/** Deterministic 32-bit RNG so oracle failures are reproducible. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

export function blank(): Assessment {
  return emptyAssessment(CATALOGUE_META.catalogueHash, NOW);
}

export function withStatuses(entries: Record<string, Status>): Assessment {
  const a = blank();
  for (const [id, status] of Object.entries(entries)) {
    a.requirements[id] = {
      status,
      poam: false,
      poamDate: null,
      updatedAt: NOW.toISOString(),
    };
  }
  return a;
}

export function allStatus(status: Status): Assessment {
  return withStatuses(Object.fromEntries(CATALOGUE.map((r) => [r.requirement, status])));
}

/** Random but always LEGAL: `partial` only where partialWeight exists. */
export function randomAssessment(rng: () => number): Assessment {
  const a = blank();
  for (const r of CATALOGUE) {
    const pool: Status[] =
      r.partialWeight === null
        ? ['unassessed', 'satisfied', 'not-satisfied']
        : ['unassessed', 'satisfied', 'not-satisfied', 'partial'];
    const status = pool[Math.floor(rng() * pool.length)]!;
    if (status === 'unassessed' && rng() < 0.5) continue;
    a.requirements[r.requirement] = {
      status,
      poam: rng() < 0.1,
      poamDate: rng() < 0.5 ? '2025-06-30' : null,
      updatedAt: NOW.toISOString(),
    };
  }
  return a;
}

export function randomObjectiveStatuses(rng: () => number): Record<string, ObjectiveStatus> {
  const out: Record<string, ObjectiveStatus> = {};
  const pool: ObjectiveStatus[] = ['unassessed', 'satisfied', 'not-satisfied'];
  for (const r of CATALOGUE) {
    for (const o of r.objectives) out[o.objective] = pool[Math.floor(rng() * pool.length)]!;
  }
  return out;
}
