import { z } from 'zod';
import type { ObjectiveStatus, Status } from '../domain/types';

export const SCHEMA_VERSION = 1 as const;

/** Gotcha Q: localStorage on *.github.io is origin-scoped, not path-scoped —
 *  every project page on the same account shares it. Namespace the key. */
export const STORAGE_KEY = 'cmmc-sa:v1:assessment';

export const DISCLAIMER =
  'UNOFFICIAL TOOL. Derived from a public DCMA DIBCAC file. Not affiliated with, ' +
  'endorsed by, or approved by DCMA, the DoD, or any US Government agency. ' +
  'Covers NIST SP 800-171 Revision 2 (110 requirements); Revision 3 restructures ' +
  'the catalogue. The computed score uses the SPRS methodology but is a ' +
  'self-computed estimate and is NOT a submission to SPRS.';

export const statusSchema = z.enum(['unassessed', 'satisfied', 'partial', 'not-satisfied']);
export const objectiveStatusSchema = z.enum(['unassessed', 'satisfied', 'not-satisfied']);

export const requirementEntrySchema = z
  .object({
    status: statusSchema,
    poam: z.boolean(),
    poamDate: z.string().nullable(),
    note: z.string().optional(),
    updatedAt: z.string(),
  })
  .strict();

export const objectiveEntrySchema = z
  .object({
    status: objectiveStatusSchema,
    evidenceNote: z.string().optional(),
    prepared: z.boolean().optional(),
    updatedAt: z.string(),
  })
  .strict();

export const assessmentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    catalogueHash: z.string(),
    orgLabel: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /** Gotcha B: requirements and objectives MUST be separate maps — 23
     *  objective ids are byte-identical to their requirement id. */
    requirements: z.record(z.string(), requirementEntrySchema),
    objectives: z.record(z.string(), objectiveEntrySchema),
  })
  .strict();

export type RequirementEntry = z.infer<typeof requirementEntrySchema>;
export type ObjectiveEntry = z.infer<typeof objectiveEntrySchema>;
export type Assessment = z.infer<typeof assessmentSchema>;

/** Export envelope. Gotcha S / test 42: the disclaimer travels with the data. */
export const exportEnvelopeSchema = z
  .object({
    kind: z.literal('cmmc-self-assessment-export'),
    exportedAt: z.string(),
    disclaimer: z.string(),
    assessment: assessmentSchema,
  })
  .strict();

export type ExportEnvelope = z.infer<typeof exportEnvelopeSchema>;

export function emptyAssessment(catalogueHash: string, now: Date = new Date()): Assessment {
  const iso = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    catalogueHash,
    createdAt: iso,
    updatedAt: iso,
    requirements: {},
    objectives: {},
  };
}

export function statusOf(assessment: Assessment, requirementId: string): Status {
  return assessment.requirements[requirementId]?.status ?? 'unassessed';
}

export function objectiveStatusOf(assessment: Assessment, objectiveId: string): ObjectiveStatus {
  return assessment.objectives[objectiveId]?.status ?? 'unassessed';
}
