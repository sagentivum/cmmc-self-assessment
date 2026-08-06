import { useMemo } from 'react';
import { CATALOGUE } from '../domain/catalogue';
import { scoreAssessment, type ScoreResult } from '../scoring/engine';
import { useStore } from '../state/store';

/**
 * Recompute wholesale — 110 requirements is sub-millisecond. No incremental
 * scoring, no cache invalidation bugs.
 */
export function useScore(opts?: { waterfallBy?: 'domain' | 'requirement' }): ScoreResult {
  const assessment = useStore((s) => s.assessment);
  const waterfallBy = opts?.waterfallBy ?? 'domain';
  return useMemo(
    () => scoreAssessment(CATALOGUE, assessment, { now: new Date(), waterfallBy }),
    [assessment, waterfallBy],
  );
}
