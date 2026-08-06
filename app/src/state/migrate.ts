import { SCHEMA_VERSION, assessmentSchema, emptyAssessment, type Assessment } from './schema';
import { CATALOGUE_META } from '../generated/catalogue.meta';
import { OBJECTIVE_BY_ID, REQUIREMENT_BY_ID } from '../domain/catalogue';

/**
 * Persisted-state migration. There is only one schema version today; the point
 * of this function existing now is that v2 must never be a guess.
 */
export function migrateAssessment(persisted: unknown, version: number): Assessment {
  if (persisted === null || typeof persisted !== 'object') {
    return emptyAssessment(CATALOGUE_META.catalogueHash);
  }
  if (version > SCHEMA_VERSION) {
    // Refuse to downgrade-guess. Start clean rather than corrupt.
    return emptyAssessment(CATALOGUE_META.catalogueHash);
  }
  const parsed = assessmentSchema.safeParse(persisted);
  if (!parsed.success) return emptyAssessment(CATALOGUE_META.catalogueHash);
  return sanitise(parsed.data);
}

/** Test 33: unknown ids in persisted state are ignored, never crash. */
export function sanitise(a: Assessment): Assessment {
  const requirements: Assessment['requirements'] = {};
  for (const [id, entry] of Object.entries(a.requirements)) {
    const req = REQUIREMENT_BY_ID.get(id);
    if (!req) continue;
    requirements[id] =
      entry.status === 'partial' && req.partialWeight === null
        ? { ...entry, status: 'not-satisfied' }
        : entry;
  }
  const objectives: Assessment['objectives'] = {};
  for (const [id, entry] of Object.entries(a.objectives)) {
    if (OBJECTIVE_BY_ID.has(id)) objectives[id] = entry;
  }
  return { ...a, requirements, objectives };
}
