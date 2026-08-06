import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { REQUIREMENT_BY_ID } from '../../domain/catalogue';
import { useScore } from '../../lib/useScore';
import { pct, plural, titleCaseFamily } from '../../lib/format';
import { Waterfall } from './Waterfall';

export function ScoreView(): React.ReactElement {
  const [waterfallBy, setWaterfallBy] = useState<'domain' | 'requirement'>('domain');
  const score = useScore({ waterfallBy });

  /** "Points on the table": everything not yet satisfied, heaviest first.
   *  Gotcha H: 3.12.4 has weight 0, so a naive sort buries it. It is listed
   *  separately rather than dropped. */
  const onTheTable = useMemo(
    () =>
      score.byRequirement
        .filter((r) => r.status !== 'satisfied' && r.weight > 0)
        .sort((a, b) => b.weight - a.weight || a.requirement.localeCompare(b.requirement)),
    [score],
  );

  const zeroWeightOpen = score.byRequirement.filter(
    (r) => r.weight === 0 && r.status !== 'satisfied',
  );

  const untouched = score.assessedCount === 0;

  return (
    <main className="page" id="main">
      <h1>Score</h1>

      {/* Gotcha A: a blank assessment scores 110, exactly like a perfect one.
          Score and completeness are always shown together, and an untouched
          assessment says so in as many words. */}
      <div className="scorehead">
        <section className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            SPRS-methodology score, self-computed
          </div>
          <div className="bignum" data-testid="score-value">
            {score.score}
          </div>
          <div className="scale" aria-hidden="true">
            <div
              className="scale__marker"
              style={{
                left: `${((score.score - score.minScore) / (score.maxScore - score.minScore)) * 100}%`,
              }}
            />
          </div>
          <div className="scale__ends">
            <span>floor {score.minScore}</span>
            <span>0</span>
            <span>ceiling {score.maxScore}</span>
          </div>
          <p className="tiny muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            Starts at {score.maxScore}; {score.totalWeight} points are available to lose across{' '}
            {score.requirementCount} requirements. This is <b>not</b> a submission to SPRS.
          </p>
        </section>

        <section className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Completeness
          </div>
          <div className="bignum" data-testid="completeness-value">
            {pct(score.percentComplete)}
          </div>
          <div className="meter" style={{ marginTop: '0.5rem' }}>
            <div
              className={`meter__fill${score.percentComplete === 100 ? ' meter__fill--ok' : ''}`}
              style={{ width: `${score.percentComplete}%` }}
            />
          </div>
          <p className="tiny muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            {score.assessedCount} of {score.requirementCount} requirements have a decision recorded.
          </p>
        </section>

        <section className="card">
          <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Where you stand
          </div>
          <table className="data" style={{ marginTop: '0.35rem' }}>
            <tbody>
              <tr>
                <td>Satisfied</td>
                <td className="num">{score.counts.satisfied}</td>
              </tr>
              <tr>
                <td>Partial credit</td>
                <td className="num">{score.counts.partial}</td>
              </tr>
              <tr>
                <td>Not satisfied</td>
                <td className="num">{score.counts['not-satisfied']}</td>
              </tr>
              <tr>
                <td>Unassessed</td>
                <td className="num">{score.counts.unassessed}</td>
              </tr>
              <tr>
                <td>Points deducted</td>
                <td className="num">
                  <b>{score.totalDeduction}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      {untouched && (
        <div className="alert alert--warn" style={{ marginTop: '1rem' }} data-testid="blank-warning">
          <b>Nothing has been assessed yet — and a blank assessment scores {score.maxScore}, the
          same as a perfect one.</b>{' '}
          That is faithful to the source methodology, which deducts only for requirements you have
          explicitly marked as not met. Read this {score.maxScore} as &ldquo;no information&rdquo;,
          not &ldquo;compliant&rdquo;. <Link to="/assess">Start assessing →</Link>
        </div>
      )}

      <div className="stack" style={{ marginTop: '1rem' }}>
        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>How you got here</h2>
            <div className="row no-print">
              <button
                type="button"
                className="btn btn--sm"
                aria-pressed={waterfallBy === 'domain'}
                onClick={() => setWaterfallBy('domain')}
              >
                By family
              </button>
              <button
                type="button"
                className="btn btn--sm"
                aria-pressed={waterfallBy === 'requirement'}
                onClick={() => setWaterfallBy('requirement')}
              >
                By requirement
              </button>
            </div>
          </div>
          <Waterfall steps={score.waterfall} maxScore={score.maxScore} minScore={score.minScore} />
          {waterfallBy === 'requirement' && score.waterfall.length === 1 && (
            <p className="small muted">No deductions yet, so there is nothing to break down.</p>
          )}
        </section>

        <section className="card">
          <h2>By domain</h2>
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Family</th>
                  <th className="num">Reqs</th>
                  <th className="num">Assessed</th>
                  <th className="num">Deducted</th>
                  <th className="num">Possible</th>
                  <th style={{ width: '9rem' }}>Share of possible</th>
                </tr>
              </thead>
              <tbody>
                {score.byDomain.map((d) => (
                  <tr key={d.familyNumber}>
                    <td className="mono">{d.cmmcDomain}</td>
                    <td>
                      <Link to={`/assess/${d.familyNumber}`}>{titleCaseFamily(d.familyName)}</Link>
                    </td>
                    <td className="num">{d.requirementCount}</td>
                    <td className="num">
                      {d.assessedCount}/{d.requirementCount}
                    </td>
                    <td className="num">{d.deduction === 0 ? '—' : `−${d.deduction}`}</td>
                    <td className="num">{d.possibleDeduction}</td>
                    <td>
                      <div className="meter">
                        <div
                          className="meter__fill"
                          style={{
                            width: `${d.possibleDeduction === 0 ? 0 : (d.deduction / d.possibleDeduction) * 100}%`,
                            background: 'var(--bad)',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th />
                  <th>Total</th>
                  <th className="num">{score.requirementCount}</th>
                  <th className="num">{score.assessedCount}</th>
                  <th className="num">−{score.totalDeduction}</th>
                  <th className="num">{score.totalWeight}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>Points on the table</h2>
          <p className="small muted">
            Requirements that are not yet satisfied, heaviest first — {plural(onTheTable.length, 'requirement')}{' '}
            worth {onTheTable.reduce((n, r) => n + r.weight, 0)} points. Unassessed counts here too:
            an unassessed requirement is not a passing one, it is an unknown one.
          </p>
          {onTheTable.length === 0 ? (
            <p className="small muted">Every point-bearing requirement is marked satisfied.</p>
          ) : (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th className="num">Pts</th>
                    <th>Requirement</th>
                    <th>Practice</th>
                    <th>Status</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {onTheTable.slice(0, 40).map((r) => {
                    const req = REQUIREMENT_BY_ID.get(r.requirement)!;
                    return (
                      <tr key={r.requirement}>
                        <td className="num">
                          <b>{r.weight}</b>
                        </td>
                        <td>
                          <Link className="mono" to={`/assess/${req.familyNumber}/${r.requirement}`}>
                            {r.requirement}
                          </Link>
                        </td>
                        <td className="mono tiny">{req.cmmcPractice}</td>
                        <td className="tiny">
                          {r.status === 'unassessed' ? 'Unassessed' : 'Not satisfied'}
                        </td>
                        <td className="tiny muted">{req.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {onTheTable.length > 40 && (
                <p className="tiny faint">
                  Showing the top 40 of {onTheTable.length}. <Link to="/assess">See them all →</Link>
                </p>
              )}
            </div>
          )}

          {/* Gotcha H: 3.12.4 cannot appear above — weight 0 — but must not vanish. */}
          {zeroWeightOpen.length > 0 && (
            <div className="editorial" style={{ marginTop: '0.75rem' }}>
              <span className="editorial__tag">Editorial note — ours, not the source&rsquo;s</span>
              {zeroWeightOpen.map((r) => REQUIREMENT_BY_ID.get(r.requirement)!.cmmcPractice).join(', ')}{' '}
              carries <b>zero points</b> and so cannot appear in the ranking above at any position —
              but it is still open, and it is the System Security Plan. It is one of the largest
              pieces of real work in the catalogue and the thing an assessor is most likely to ask
              for first.{' '}
              {zeroWeightOpen.map((r) => (
                <Link
                  key={r.requirement}
                  className="mono"
                  to={`/assess/${REQUIREMENT_BY_ID.get(r.requirement)!.familyNumber}/${r.requirement}`}
                >
                  {r.requirement}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>POA&amp;M register</h2>
          {score.poamCount === 0 ? (
            <p className="small muted">
              No requirement is flagged for a plan of action. Flag them in the Assess view.
            </p>
          ) : (
            <>
              <p className="small muted">
                {plural(score.poamCount, 'requirement')} flagged
                {score.poamOverdueCount > 0 && (
                  <>
                    {' '}
                    · <b style={{ color: 'var(--bad)' }}>{score.poamOverdueCount} past target date</b>
                  </>
                )}
                .
              </p>
              <div className="scroll-x">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Requirement</th>
                      <th>Practice</th>
                      <th>Family</th>
                      <th className="num">Pts</th>
                      <th>Status</th>
                      <th>Target date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {score.poam.map((p) => (
                      <tr key={p.requirement} style={p.overdue ? { background: 'var(--bad-soft)' } : undefined}>
                        <td className="mono">{p.requirement}</td>
                        <td className="mono tiny">{p.cmmcPractice}</td>
                        <td className="tiny">{titleCaseFamily(p.familyName)}</td>
                        <td className="num">{p.weight}</td>
                        <td className="tiny">{p.status}</td>
                        <td className="tiny">
                          {p.poamDate ?? <span className="faint">no date set</span>}
                          {p.overdue && <b style={{ color: 'var(--bad)' }}> · overdue</b>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="editorial" style={{ marginTop: '0.6rem' }}>
                <span className="editorial__tag">Editorial note — ours, not the source&rsquo;s</span>
                Which requirements may actually sit on a POA&amp;M, and for how long, is set by
                32 CFR Part 170 and your contract — not by this tool and not by the source database.
                This register is a tracking aid, nothing more.
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
