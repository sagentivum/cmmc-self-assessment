import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ALL_OBJECTIVES, CATALOGUE, REQUIREMENT_BY_ID } from '../../domain/catalogue';
import { EVIDENCE_SLUGS, objKey, type EvidenceSlug } from '../../domain/types';
import { useStore } from '../../state/store';
import { evidenceRequestText } from '../../state/io';
import { downloadText } from '../../lib/download';
import { plural, titleCaseFamily } from '../../lib/format';

interface BucketMeta {
  slug: EvidenceSlug;
  name: string;
  /**
   * Gotcha G: this gloss is OURS. The source database contains no "typical
   * questions asked" data — one stale query inside it references columns that
   * do not exist. Every gloss is rendered inside the .editorial treatment so it
   * can never be mistaken for DCMA text.
   */
  gloss: string;
}

const BUCKETS: readonly BucketMeta[] = [
  {
    slug: 'document',
    name: 'Document',
    gloss:
      'Expect to hand over something written and approved — a policy, a plan, a procedure, a signed list. The question behind these is usually "where is it defined?", not "does it work?".',
  },
  {
    slug: 'screen-share',
    name: 'Screen Share',
    gloss:
      'Expect to drive. Someone will watch you open the console and show the setting actually in force, on the real system, not in a diagram of it.',
  },
  {
    slug: 'artifact',
    name: 'Artifact',
    gloss:
      'Expect an output rather than a document: an export, a log extract, a report, a ticket, a screenshot of a result. Evidence that the control ran, not that it exists.',
  },
  {
    slug: 'physical-review',
    name: 'Physical Review',
    gloss:
      'Expect a walk. These are the ones checked by standing in the room: doors, badge readers, cabinets, cabling, media storage, visitor logs.',
  },
  {
    slug: 'artifact-and-screen-share',
    name: 'Artifact and Screen Share',
    gloss:
      'The only objective in the whole catalogue that asks for both at once — show it configured, and produce the artefact that proves what it is.',
  },
];

export function EvidenceView(): React.ReactElement {
  const params = useParams<{ standardSlug?: string }>();
  const slug = params.standardSlug as EvidenceSlug | undefined;

  const assessment = useStore((s) => s.assessment);
  const setObjectivePrepared = useStore((s) => s.setObjectivePrepared);
  const setObjectiveNote = useStore((s) => s.setObjectiveNote);
  const [openOnly, setOpenOnly] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ALL_OBJECTIVES) m.set(o.evidenceSlug, (m.get(o.evidenceSlug) ?? 0) + 1);
    return m;
  }, []);

  const prepared = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ALL_OBJECTIVES) {
      if (assessment.objectives[o.objective]?.prepared) {
        m.set(o.evidenceSlug, (m.get(o.evidenceSlug) ?? 0) + 1);
      }
    }
    return m;
  }, [assessment]);

  if (!slug || !(EVIDENCE_SLUGS as readonly string[]).includes(slug)) {
    return (
      <main className="page" id="main">
        <h1>Evidence</h1>
        <p className="muted" style={{ maxWidth: '68ch' }}>
          Every one of the {ALL_OBJECTIVES.length} assessment objectives carries an evidence
          standard in the source database — the kind of proof an assessor expects for that specific
          objective. Grouping by that standard turns the catalogue into a preparation checklist
          rather than a reading list.
        </p>

        <div className="editorial" style={{ maxWidth: '68ch', marginBottom: '1rem' }}>
          <span className="editorial__tag">Editorial note — ours, not the source&rsquo;s</span>
          The <b>evidence standard</b> on each objective, and the objective text itself, come from
          the DCMA file. The short descriptions of what each bucket feels like in practice are ours,
          written to help you prepare. The source file contains no &ldquo;typical questions
          asked&rdquo; data of any kind.
        </div>

        <div className="bucketgrid">
          {BUCKETS.map((b) => {
            const n = counts.get(b.slug) ?? 0;
            /* Gotcha J: n = 1 for artifact-and-screen-share. Rendering it as a
               peer-sized card makes a correct number look like a bug. */
            const singleton = n === 1;
            return (
              <Link
                key={b.slug}
                to={`/evidence/${b.slug}`}
                className={`bucket${singleton ? ' bucket--singleton' : ''}${
                  b.slug === 'physical-review' ? ' bucket--walk' : ''
                }`}
                data-testid={`bucket-${b.slug}`}
              >
                <div>
                  <div className="bucket__n">
                    {singleton ? 'Just 1 objective' : n}
                    {!singleton && (
                      <span className="tiny faint" style={{ fontWeight: 400 }}>
                        {' '}
                        objectives
                      </span>
                    )}
                  </div>
                  <div className="bucket__name">{b.name}</div>
                  <div className="bucket__gloss">{b.gloss}</div>
                  <div className="tiny faint" style={{ marginTop: '0.4rem' }}>
                    {prepared.get(b.slug) ?? 0} marked prepared
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    );
  }

  const bucket = BUCKETS.find((b) => b.slug === slug)!;
  const objectives = ALL_OBJECTIVES.filter((o) => o.evidenceSlug === slug);

  const groups = CATALOGUE.map((req) => ({
    req,
    objectives: objectives.filter((o) => o.requirement === req.requirement),
  }))
    .filter((g) => g.objectives.length > 0)
    .filter((g) => {
      if (!openOnly) return true;
      const status = assessment.requirements[g.req.requirement]?.status ?? 'unassessed';
      return status !== 'satisfied';
    });

  const byFamily = new Map<string, typeof groups>();
  for (const g of groups) {
    const list = byFamily.get(g.req.familyNumber) ?? [];
    list.push(g);
    byFamily.set(g.req.familyNumber, list);
  }

  return (
    <main className="page" id="main">
      <p className="small">
        <Link to="/evidence">← All evidence standards</Link>
      </p>
      <h1>{bucket.name}</h1>
      <p className="small muted" style={{ margin: 0 }}>
        {plural(objectives.length, 'assessment objective')} across{' '}
        {plural(new Set(objectives.map((o) => o.requirement)).size, 'requirement')}.
      </p>

      <div className="editorial" style={{ margin: '0.75rem 0', maxWidth: '70ch' }}>
        <span className="editorial__tag">Editorial note — ours, not the source&rsquo;s</span>
        {bucket.gloss}
      </div>

      <div className="row no-print" style={{ marginBottom: '0.75rem' }}>
        <label className="small" style={{ display: 'inline-flex', gap: '0.3rem' }}>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Only requirements that are not yet satisfied
        </label>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() =>
            downloadText(
              `evidence-request-${new Date().toISOString().slice(0, 10)}.txt`,
              evidenceRequestText(assessment, new Date()),
              'text/plain',
            )
          }
        >
          Export full evidence request list
        </button>
        <button type="button" className="btn btn--sm" onClick={() => window.print()}>
          Print this bucket
        </button>
      </div>

      <div className="stack">
        {[...byFamily.entries()].map(([familyNumber, list]) => {
          const head = list[0]!.req;
          return (
            <section key={familyNumber} className="card">
              <h2 style={{ fontSize: '0.95rem' }}>
                <span className="mono faint">{head.cmmcDomain}</span>{' '}
                {titleCaseFamily(head.familyName)}
              </h2>
              {list.map(({ req, objectives: objs }) => {
                const status = assessment.requirements[req.requirement]?.status ?? 'unassessed';
                return (
                  <div key={req.requirement} style={{ marginTop: '0.6rem' }}>
                    <div className="row" style={{ gap: '0.4rem' }}>
                      <Link
                        to={`/assess/${req.familyNumber}/${req.requirement}`}
                        className="mono"
                        style={{ fontWeight: 650 }}
                      >
                        {req.requirement}
                      </Link>
                      <span className="chip chip--mono">{req.cmmcPractice}</span>
                      <span className="chip">{status === 'unassessed' ? 'Unassessed' : status}</span>
                      <span className="small muted">{req.description}</span>
                    </div>
                    {objs.map((o) => {
                      const entry = assessment.objectives[o.objective];
                      return (
                        <div className="objrow" key={objKey(o.objective)}>
                          <input
                            type="checkbox"
                            checked={entry?.prepared ?? false}
                            onChange={(e) => setObjectivePrepared(o.objective, e.target.checked)}
                            aria-label={`Mark evidence prepared for ${o.objective}`}
                          />
                          <div>
                            <div className="objrow__id">{o.objective}</div>
                            {/* The source text already reads "Determine if…",
                                which IS the assessor's question. Do not rewrite. */}
                            <div className="objrow__text">
                              <span className="faint">Determine if </span>
                              {o.text}
                            </div>
                            <input
                              className="notebox"
                              style={{ minHeight: 0, marginTop: '0.25rem' }}
                              value={entry?.evidenceNote ?? ''}
                              onChange={(e) => setObjectiveNote(o.objective, e.target.value)}
                              placeholder="Where this evidence lives, who produces it…"
                              aria-label={`Evidence note for ${o.objective}`}
                            />
                          </div>
                          <span className="chip">{o.evidenceStandard}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          );
        })}
        {groups.length === 0 && (
          <div className="card muted">
            Every requirement in this bucket is already marked satisfied.
          </div>
        )}
      </div>

      <p className="tiny faint" style={{ marginTop: '1rem' }}>
        Requirement identifiers, objective text and evidence standards are reproduced from the public
        DCMA DIBCAC database.{' '}
        {REQUIREMENT_BY_ID.size} requirements, {ALL_OBJECTIVES.length} objectives in total.
      </p>
    </main>
  );
}
