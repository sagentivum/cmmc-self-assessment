import { create } from 'zustand';
import { persist, createJSONStorage, type PersistStorage } from 'zustand/middleware';
import { CATALOGUE_META } from '../generated/catalogue.meta';
import { REQUIREMENT_BY_ID } from '../domain/catalogue';
import type { ObjectiveStatus, Status } from '../domain/types';
import { migrateAssessment } from './migrate';
import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  emptyAssessment,
  type Assessment,
} from './schema';

export interface StoreState {
  assessment: Assessment;
  /** Test 34: set when localStorage is unavailable so the UI can warn. */
  storageAvailable: boolean;
  noticeAcknowledged: boolean;
  hydrated: boolean;
  lastImport: { warnings: string[]; at: string } | null;

  setStatus: (requirementId: string, status: Status) => void;
  setPoam: (requirementId: string, poam: boolean) => void;
  setPoamDate: (requirementId: string, date: string | null) => void;
  setNote: (requirementId: string, note: string) => void;
  setObjectiveStatus: (objectiveId: string, status: ObjectiveStatus) => void;
  setObjectivePrepared: (objectiveId: string, prepared: boolean) => void;
  setObjectiveNote: (objectiveId: string, note: string) => void;
  setOrgLabel: (label: string) => void;
  acknowledgeNotice: () => void;
  replaceAssessment: (a: Assessment, warnings?: string[]) => void;
  clear: () => void;
}

/** Test 34: private-mode / quota-exceeded degrades to in-memory. */
function probeStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probe = `${STORAGE_KEY}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const memory = new Map<string, string>();

const resilientStorage: PersistStorage<PersistedShape> | undefined = createJSONStorage<PersistedShape>(
  () => ({
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return memory.get(name) ?? null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch {
        memory.set(name, value);
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        memory.delete(name);
      }
    },
  }),
);

interface PersistedShape {
  assessment: Assessment;
  noticeAcknowledged: boolean;
}

const nowIso = (): string => new Date().toISOString();

function touch(a: Assessment): Assessment {
  return { ...a, updatedAt: nowIso() };
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      assessment: emptyAssessment(CATALOGUE_META.catalogueHash),
      storageAvailable: probeStorage(),
      noticeAcknowledged: false,
      hydrated: false,
      lastImport: null,

      setStatus: (requirementId, status) =>
        set((s) => {
          const req = REQUIREMENT_BY_ID.get(requirementId);
          if (!req) return s;
          if (status === 'partial' && req.partialWeight === null) {
            // Unrepresentable by construction in the UI; guard the API anyway.
            return s;
          }
          const prev = s.assessment.requirements[requirementId];
          return {
            assessment: touch({
              ...s.assessment,
              requirements: {
                ...s.assessment.requirements,
                [requirementId]: {
                  poam: prev?.poam ?? false,
                  poamDate: prev?.poamDate ?? null,
                  ...(prev?.note !== undefined ? { note: prev.note } : {}),
                  status,
                  updatedAt: nowIso(),
                },
              },
            }),
          };
        }),

      setPoam: (requirementId, poam) =>
        set((s) => {
          if (!REQUIREMENT_BY_ID.has(requirementId)) return s;
          const prev = s.assessment.requirements[requirementId];
          return {
            assessment: touch({
              ...s.assessment,
              requirements: {
                ...s.assessment.requirements,
                [requirementId]: {
                  status: prev?.status ?? 'unassessed',
                  poamDate: prev?.poamDate ?? null,
                  ...(prev?.note !== undefined ? { note: prev.note } : {}),
                  poam,
                  updatedAt: nowIso(),
                },
              },
            }),
          };
        }),

      setPoamDate: (requirementId, date) =>
        set((s) => {
          if (!REQUIREMENT_BY_ID.has(requirementId)) return s;
          const prev = s.assessment.requirements[requirementId];
          return {
            assessment: touch({
              ...s.assessment,
              requirements: {
                ...s.assessment.requirements,
                [requirementId]: {
                  status: prev?.status ?? 'unassessed',
                  poam: prev?.poam ?? true,
                  ...(prev?.note !== undefined ? { note: prev.note } : {}),
                  poamDate: date,
                  updatedAt: nowIso(),
                },
              },
            }),
          };
        }),

      setNote: (requirementId, note) =>
        set((s) => {
          if (!REQUIREMENT_BY_ID.has(requirementId)) return s;
          const prev = s.assessment.requirements[requirementId];
          return {
            assessment: touch({
              ...s.assessment,
              requirements: {
                ...s.assessment.requirements,
                [requirementId]: {
                  status: prev?.status ?? 'unassessed',
                  poam: prev?.poam ?? false,
                  poamDate: prev?.poamDate ?? null,
                  note,
                  updatedAt: nowIso(),
                },
              },
            }),
          };
        }),

      setObjectiveStatus: (objectiveId, status) =>
        set((s) => ({
          assessment: touch({
            ...s.assessment,
            objectives: {
              ...s.assessment.objectives,
              [objectiveId]: {
                ...s.assessment.objectives[objectiveId],
                status,
                updatedAt: nowIso(),
              },
            },
          }),
        })),

      setObjectivePrepared: (objectiveId, prepared) =>
        set((s) => ({
          assessment: touch({
            ...s.assessment,
            objectives: {
              ...s.assessment.objectives,
              [objectiveId]: {
                status: s.assessment.objectives[objectiveId]?.status ?? 'unassessed',
                ...(s.assessment.objectives[objectiveId]?.evidenceNote !== undefined
                  ? { evidenceNote: s.assessment.objectives[objectiveId]!.evidenceNote }
                  : {}),
                prepared,
                updatedAt: nowIso(),
              },
            },
          }),
        })),

      setObjectiveNote: (objectiveId, note) =>
        set((s) => ({
          assessment: touch({
            ...s.assessment,
            objectives: {
              ...s.assessment.objectives,
              [objectiveId]: {
                status: s.assessment.objectives[objectiveId]?.status ?? 'unassessed',
                ...(s.assessment.objectives[objectiveId]?.prepared !== undefined
                  ? { prepared: s.assessment.objectives[objectiveId]!.prepared }
                  : {}),
                evidenceNote: note,
                updatedAt: nowIso(),
              },
            },
          }),
        })),

      setOrgLabel: (label) =>
        set((s) => ({ assessment: touch({ ...s.assessment, orgLabel: label }) })),

      acknowledgeNotice: () => set({ noticeAcknowledged: true }),

      replaceAssessment: (a, warnings = []) =>
        set({
          assessment: touch(a),
          lastImport: { warnings, at: nowIso() },
        }),

      clear: () =>
        set({
          assessment: emptyAssessment(CATALOGUE_META.catalogueHash),
          lastImport: null,
        }),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: resilientStorage,
      partialize: (s): PersistedShape => ({
        assessment: s.assessment,
        noticeAcknowledged: s.noticeAcknowledged,
      }),
      migrate: (persisted, version) => {
        const p = persisted as Partial<PersistedShape> | undefined;
        return {
          assessment: migrateAssessment(p?.assessment, version),
          noticeAcknowledged: p?.noticeAcknowledged === true,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/** Non-React accessor so tests and the scoring engine stay decoupled. */
export const getAssessment = (): Assessment => useStore.getState().assessment;
