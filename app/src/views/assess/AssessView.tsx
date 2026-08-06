import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CATALOGUE, FAMILIES, FAMILY_WEIGHT } from '../../domain/catalogue';
import type { Requirement, Status } from '../../domain/types';
import { reqKey } from '../../domain/types';
import { useStore } from '../../state/store';
import { StatusControl } from '../../components/StatusControl';
import { Discussion, ObjectiveTable, SourceRule } from '../../components/RequirementDetail';
import { STATUS_LABEL, plural, statusChipClass, titleCaseFamily } from '../../lib/format';

type StatusFilter = 'all' | Status;
type LevelFilter = 'all' | '1' | '2';
type WeightFilter = 'all' | '5' | '3' | '1' | '0';

export function AssessView(): React.ReactElement {
  const params = useParams<{ family?: string; requirement?: string }>();
  const navigate = useNavigate();

  const assessment = useStore((s) => s.assessment);
  const setStatus = useStore((s) => s.setStatus);
  const setPoam = useStore((s) => s.setPoam);
  const setPoamDate = useStore((s) => s.setPoamDate);
  const setNote = useStore((s) => s.setNote);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [weightFilter, setWeightFilter] = useState<WeightFilter>('all');
  const [poamOnly, setPoamOnly] = useState(false);
  const [openObjectivesOnly, setOpenObjectivesOnly] = useState(false);
  const [query, setQuery] = useState('');

  const familyNumber = params.family && params.family !== 'all' ? params.family : null;
  const selectedId = params.requirement ?? null;

  const statusOf = useCallback(
    (id: string): Status => assessment.requirements[id]?.status ?? 'unassessed',
    [assessment],
  );

  const visible = useMemo(() => {
    const folded = query.trim().toLowerCase().replace(/\s+/g, ' ');
    return CATALOGUE.filter((r) => {
      if (familyNumber && r.familyNumber !== familyNumber) return false;
      if (statusFilter !== 'all' && statusOf(r.requirement) !== statusFilter) return false;
      if (levelFilter !== 'all' && String(r.cmmcLevel) !== levelFilter) return false;
      if (weightFilter !== 'all' && String(r.weight) !== weightFilter) return false;
      if (poamOnly && !assessment.requirements[r.requirement]?.poam) return false;
      if (openObjectivesOnly) {
        const anyOpen = r.objectives.some(
          (o) => (assessment.objectives[o.objective]?.status ?? 'unassessed') === 'unassessed',
        );
        if (!anyOpen) return false;
      }
      if (folded && !r.searchText.includes(folded)) {
        if (!r.objectives.some((o) => o.searchText.includes(folded))) return false;
      }
      return true;
    });
  }, [
    familyNumber,
    statusFilter,
    levelFilter,
    weightFilter,
    poamOnly,
    openObjectivesOnly,
    query,
    statusOf,
    assessment,
  ]);

  /* ------------------------------------------------------------- keyboard */

  const select = useCallback(
    (req: Requirement | undefined) => {
      if (!req) return;
      navigate(`/assess/${req.familyNumber}/${req.requirement}`);
      document.getElementById(reqKey(req.requirement))?.scrollIntoView({ block: 'nearest' });
    },
    [navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const index = visible.findIndex((r) => r.requirement === selectedId);
      const current = index >= 0 ? visible[index] : undefined;

      if (e.key === 'j') {
        e.preventDefault();
        select(index < 0 ? visible[0] : visible[Math.min(index + 1, visible.length - 1)]);
      } else if (e.key === 'k') {
        e.preventDefault();
        select(index < 0 ? visible[0] : visible[Math.max(index - 1, 0)]);
      } else if (current) {
        if (e.key === '1') {
          e.preventDefault();
          setStatus(current.requirement, 'satisfied');
        } else if (e.key === '2') {
          e.preventDefault();
          setStatus(current.requirement, 'not-satisfied');
        } else if (e.key === '3' && current.partialWeight !== null) {
          e.preventDefault();
          setStatus(current.requirement, 'partial');
        } else if (e.key === 'p') {
          e.preventDefault();
          setPoam(current.requirement, !assessment.requirements[current.requirement]?.poam);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selectedId, select, setStatus, setPoam, assessment]);

  /* ----------------------------------------------------------------- rail */

  const railStats = useMemo(
    () =>
      FAMILIES.map((f) => {
        const assessed = f.requirements.filter((r) => statusOf(r.requirement) !== 'unassessed').length;
        const atRisk = f.requirements
          .filter((r) => statusOf(r.requirement) !== 'satisfied')
          .reduce((n, r) => n + r.weight, 0);
        return { family: f, assessed, atRisk, total: f.requirements.length };
      }),
    [statusOf],
  );

  const totalAssessed = CATALOGUE.filter((r) => statusOf(r.requirement) !== 'unassessed').length;
  const activeFamily = familyNumber
    ? FAMILIES.find((f) => f.familyNumber === familyNumber)
    : undefined;

  return (
    <main className="page" id="main">
      <div className="split">
        <nav className="rail" aria-label="Requirement families">
          <Link to="/assess" className={`rail__item${familyNumber === null ? ' active' : ''}`}>
            <span className="rail__top">
              <span className="rail__name">All families</span>
              <span className="rail__meta">
                {totalAssessed}/{CATALOGUE.length}
              </span>
            </span>
            <span className="meter" style={{ display: 'block', marginTop: '0.25rem' }}>
              <span
                className={`meter__fill${totalAssessed === CATALOGUE.length ? ' meter__fill--ok' : ''}`}
                style={{ width: `${(totalAssessed / CATALOGUE.length) * 100}%` }}
              />
            </span>
          </Link>

          {railStats.map(({ family, assessed, atRisk, total }) => (
            <Link
              key={family.familyNumber}
              to={`/assess/${family.familyNumber}`}
              className={`rail__item${familyNumber === family.familyNumber ? ' active' : ''}`}
            >
              <span className="rail__top">
                <span className="rail__name">
                  <span className="mono faint">{family.cmmcDomain}</span>{' '}
                  {titleCaseFamily(family.familyName)}
                </span>
                <span className="rail__meta">
                  {assessed}/{total}
                </span>
              </span>
              <span className="meter" style={{ display: 'block', margin: '0.25rem 0 0.15rem' }}>
                <span
                  className={`meter__fill${assessed === total ? ' meter__fill--ok' : ''}`}
                  style={{ width: `${(assessed / total) * 100}%` }}
                />
              </span>
              <span className="rail__meta">
                {atRisk} of {FAMILY_WEIGHT.get(family.familyNumber)} pts at risk
              </span>
            </Link>
          ))}
        </nav>

        <div className="stack">
          <div>
            <h1 style={{ marginBottom: '0.15rem' }}>
              {activeFamily ? titleCaseFamily(activeFamily.familyName) : 'All requirements'}
            </h1>
            <p className="small muted" style={{ margin: 0 }}>
              Showing {plural(visible.length, 'requirement')} of {CATALOGUE.length}. Keyboard:{' '}
              <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>1</kbd> satisfied, <kbd>2</kbd> not satisfied,{' '}
              <kbd>3</kbd> partial (where offered), <kbd>p</kbd> POA&amp;M.
            </p>
          </div>

          <div className="filters no-print" role="search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search text, ids, objectives…"
              aria-label="Search requirements"
              style={{ minWidth: '15rem' }}
            />
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              >
                <option value="all">Any</option>
                <option value="unassessed">Unassessed</option>
                <option value="satisfied">Satisfied</option>
                <option value="partial">Partial</option>
                <option value="not-satisfied">Not satisfied</option>
              </select>
            </label>
            <label>
              Level
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as LevelFilter)}
              >
                <option value="all">Any</option>
                <option value="1">L1</option>
                <option value="2">L2</option>
              </select>
            </label>
            <label>
              Weight
              <select
                value={weightFilter}
                onChange={(e) => setWeightFilter(e.target.value as WeightFilter)}
              >
                <option value="all">Any</option>
                <option value="5">5 points</option>
                <option value="3">3 points</option>
                <option value="1">1 point</option>
                <option value="0">0 points</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={poamOnly}
                onChange={(e) => setPoamOnly(e.target.checked)}
              />
              On POA&amp;M
            </label>
            <label>
              <input
                type="checkbox"
                checked={openObjectivesOnly}
                onChange={(e) => setOpenObjectivesOnly(e.target.checked)}
              />
              Has unassessed objectives
            </label>
          </div>

          {visible.length === 0 && <div className="card muted">Nothing matches those filters.</div>}

          {visible.map((req) => {
            const entry = assessment.requirements[req.requirement];
            const status = entry?.status ?? 'unassessed';
            const selected = selectedId === req.requirement;
            return (
              <article
                key={req.requirement}
                /* Gotcha B: namespaced DOM id — 23 objective ids are identical
                   to a requirement id, so a bare id would collide. */
                id={reqKey(req.requirement)}
                className="reqrow"
                data-selected={selected}
                data-requirement={req.requirement}
              >
                <div className="reqrow__head">
                  <div style={{ minWidth: 0, flex: '1 1 22rem' }}>
                    <div className="reqrow__ids">
                      <Link
                        to={
                          selected
                            ? `/assess/${req.familyNumber}`
                            : `/assess/${req.familyNumber}/${req.requirement}`
                        }
                        className="mono"
                        style={{ fontWeight: 650, textDecoration: 'none' }}
                      >
                        {req.requirement}
                      </Link>
                      <span className="chip chip--mono">{req.cmmcPractice}</span>
                      <span className="chip chip--accent">L{req.cmmcLevel}</span>
                      <span className={req.weight === 0 ? 'chip chip--warn' : 'chip'}>
                        {req.weight === 0
                          ? '0 pts — SSP'
                          : `${req.weight} pt${req.weight === 1 ? '' : 's'}`}
                      </span>
                      <span
                        className={statusChipClass(status)}
                        data-testid={`status-${req.requirement}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                      {entry?.poam && <span className="chip chip--warn">POA&amp;M</span>}
                    </div>
                    <p className="reqrow__desc">{req.description}</p>
                  </div>

                  <div className="reqrow__controls no-print">
                    <StatusControl
                      value={status}
                      /* Partial exists ONLY for 3.5.3 and 3.13.11. */
                      allowPartial={req.partialWeight !== null}
                      onChange={(s) => setStatus(req.requirement, s)}
                      label={`Status for requirement ${req.requirement}`}
                      idPrefix={reqKey(req.requirement)}
                    />
                    <label className="tiny muted" style={{ display: 'inline-flex', gap: '0.25rem' }}>
                      <input
                        type="checkbox"
                        checked={entry?.poam ?? false}
                        onChange={(e) => setPoam(req.requirement, e.target.checked)}
                        aria-label={`Put ${req.requirement} on a POA&M`}
                      />
                      POA&amp;M
                    </label>
                    {entry?.poam && (
                      <input
                        type="date"
                        value={entry.poamDate ?? ''}
                        onChange={(e) => setPoamDate(req.requirement, e.target.value || null)}
                        aria-label={`POA&M target date for ${req.requirement}`}
                      />
                    )}
                  </div>
                </div>

                {/* Gotcha H: 3.12.4 is weight 0 with 8 objectives. It must not
                    read as "done" merely because it cannot move the score. */}
                {req.weight === 0 && (
                  <div className="editorial" style={{ marginTop: '0.5rem' }}>
                    <span className="editorial__tag">
                      Editorial note — ours, not the source&rsquo;s
                    </span>
                    This requirement carries <b>zero points</b>, so its status can never change your
                    score — but it still has {req.objectives.length} assessment objectives and is
                    among the most expensive things on this list to actually do. A zero here is not
                    &ldquo;nothing to see&rdquo;.
                  </div>
                )}

                {/* Gotcha I: verbatim, attributed, never paraphrased. */}
                {req.partialRule && <SourceRule rule={req.partialRule} />}

                {selected && (
                  <div className="stack" style={{ marginTop: '0.75rem', gap: '0.65rem' }}>
                    <Discussion text={req.discussion} />
                    <ObjectiveTable req={req} />
                    <label className="tiny muted" style={{ display: 'block' }}>
                      Your note on {req.requirement} (stored in this browser only)
                      <textarea
                        className="notebox"
                        value={entry?.note ?? ''}
                        onChange={(e) => setNote(req.requirement, e.target.value)}
                        placeholder="Why this status, what is missing, who owns it…"
                      />
                    </label>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
