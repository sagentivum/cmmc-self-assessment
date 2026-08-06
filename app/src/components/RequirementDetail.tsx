import { useState } from 'react';
import type { ObjectiveStatus, Requirement } from '../domain/types';
import { objKey } from '../domain/types';
import { useStore } from '../state/store';

/** Gotcha I: partial_rule is DCMA's own text. Quote it, attribute it, never
 *  paraphrase it into UI copy. Seven requirements carry one; only two of those
 *  actually confer partial credit, and the others say "do not deduct if…". */
export function SourceRule({
  rule,
  partialEligible,
}: {
  rule: string;
  partialEligible: boolean;
}): React.ReactElement {
  return (
    <>
      <figure className="sourcequote">
        <blockquote>{rule}</blockquote>
        <figcaption>
          Special consideration, quoted verbatim from the source DCMA DIBCAC database.
        </figcaption>
      </figure>
      {/* Five of the seven special-consideration rules are "do not deduct if…"
          notes rather than partial credit, and there is no third status for
          them. Say so plainly rather than leaving the user to guess. */}
      {!partialEligible && (
        <div className="editorial">
          <span className="editorial__tag">Editorial note — ours, not the source&rsquo;s</span>
          This is a <b>not-applicable</b> note, not partial credit — the source database gives this
          requirement no reduced score, so there is no third option here. If the condition it
          describes genuinely applies to you, the source&rsquo;s instruction is to take no
          deduction, which in this tool means marking it <b>satisfied</b> and recording why in the
          note field.
        </div>
      )}
    </>
  );
}

export function Discussion({ text }: { text: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="disclosure" onClick={() => setOpen((v) => !v)}>
        {open ? '▾ Hide NIST discussion' : '▸ Show NIST discussion'}{' '}
        <span className="faint tiny">({text.length.toLocaleString()} characters)</span>
      </button>
      {/* Gotcha N: 103/110 discussions have no paragraph breaks at all. Cap the
          height and let it scroll rather than pushing the controls off-screen. */}
      {open && <div className="discussion">{text}</div>}
    </div>
  );
}

export function ObjectiveTable({ req }: { req: Requirement }): React.ReactElement {
  const objectives = useStore((s) => s.assessment.objectives);
  const setObjectiveStatus = useStore((s) => s.setObjectiveStatus);
  const setStatus = useStore((s) => s.setStatus);
  const reqStatus = useStore((s) => s.assessment.requirements[req.requirement]?.status ?? 'unassessed');

  const met = req.objectives.filter((o) => objectives[o.objective]?.status === 'satisfied').length;
  const failed = req.objectives.filter(
    (o) => objectives[o.objective]?.status === 'not-satisfied',
  ).length;

  const cycle = (current: ObjectiveStatus): ObjectiveStatus =>
    current === 'unassessed' ? 'satisfied' : current === 'satisfied' ? 'not-satisfied' : 'unassessed';

  /* Gotcha C: objective status has ZERO effect on the score, and this tool will
     not auto-roll-up — that would be inventing methodology. It only suggests. */
  const suggestSatisfied = met === req.objectives.length && reqStatus !== 'satisfied';
  const inconsistent = failed > 0 && reqStatus === 'satisfied';

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Assessment objectives{' '}
          <span className="faint">
            ({met}/{req.objectives.length} met)
          </span>
        </h4>
        <span className="tiny faint">Objectives do not affect the score</span>
      </div>

      {suggestSatisfied && (
        <div className="alert alert--info" style={{ marginBottom: '0.4rem' }}>
          All {req.objectives.length} objectives are marked met.{' '}
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setStatus(req.requirement, 'satisfied')}
          >
            Mark requirement satisfied?
          </button>{' '}
          <span className="tiny faint">
            Your call — this tool never rolls objectives up automatically.
          </span>
        </div>
      )}
      {inconsistent && (
        <div className="alert alert--warn" style={{ marginBottom: '0.4rem' }} role="status">
          This requirement is marked satisfied but {failed} objective
          {failed === 1 ? ' is' : 's are'} marked not met.
        </div>
      )}

      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: '5.5rem' }}>Objective</th>
              <th>Determine if…</th>
              <th style={{ width: '8rem' }}>Evidence</th>
              <th style={{ width: '7rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {req.objectives.map((o) => {
              const status = objectives[o.objective]?.status ?? 'unassessed';
              return (
                /* Gotcha B: DOM ids are namespaced — for 23 requirements the
                   objective id is byte-identical to the requirement id. */
                <tr key={objKey(o.objective)} id={objKey(o.objective)}>
                  <td className="mono tiny">{o.objective}</td>
                  <td>{o.text}</td>
                  <td>
                    <span className="chip">{o.evidenceStandard}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--sm"
                      aria-label={`Objective ${o.objective} status: ${status}. Click to change.`}
                      onClick={() => setObjectiveStatus(o.objective, cycle(status))}
                    >
                      {status === 'satisfied' ? '✓ Met' : status === 'not-satisfied' ? '✕ Not met' : '— Set'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
