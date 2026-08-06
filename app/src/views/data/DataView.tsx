import { useRef, useState } from 'react';
import { useStore } from '../../state/store';
import {
  buildExport,
  evidenceRequestText,
  exportFilename,
  otsExportCsv,
  parseImport,
} from '../../state/io';
import { downloadText, readFileAsText } from '../../lib/download';
import { CATALOGUE_META } from '../../generated/catalogue.meta';
import { useScore } from '../../lib/useScore';
import { pct } from '../../lib/format';

export function DataView(): React.ReactElement {
  const assessment = useStore((s) => s.assessment);
  const replaceAssessment = useStore((s) => s.replaceAssessment);
  const setOrgLabel = useStore((s) => s.setOrgLabel);
  const clear = useStore((s) => s.clear);
  const score = useScore();

  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; lines: string[] } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const onExport = (): void => {
    const now = new Date();
    downloadText(exportFilename(assessment, now), JSON.stringify(buildExport(assessment, now), null, 2));
    setMessage({
      kind: 'ok',
      lines: [
        'Export written to your downloads folder. It contains your entire assessment — treat it like your SSP.',
      ],
    });
  };

  const onEvidenceExport = (): void => {
    downloadText(
      `evidence-request-${new Date().toISOString().slice(0, 10)}.txt`,
      evidenceRequestText(assessment, new Date()),
      'text/plain',
    );
  };

  const onImportFile = async (file: File): Promise<void> => {
    const text = await readFileAsText(file);
    const result = parseImport(text);
    if (!result.ok || !result.assessment) {
      setMessage({ kind: 'bad', lines: [result.error ?? 'Import failed.'] });
      return;
    }
    replaceAssessment(result.assessment, result.warnings);
    setMessage({
      kind: 'ok',
      lines: ['Assessment imported.', ...result.warnings],
    });
  };

  return (
    <main className="page" id="main">
      <h1>Your data</h1>
      <p className="muted" style={{ maxWidth: '62ch' }}>
        Everything you enter lives in this browser only. There is no server and no account. Export
        regularly — clearing your browser storage will delete the assessment with no way back.
      </p>

      <div className="stack">
        {message && (
          <div
            className={message.kind === 'ok' ? 'alert alert--info' : 'alert alert--bad'}
            role="status"
            data-testid="data-message"
          >
            {message.lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}

        <section className="card">
          <h2>Current assessment</h2>
          <p className="small muted">
            Score <b>{score.score}</b> of a possible {score.maxScore} (floor {score.minScore}) ·{' '}
            <b>{pct(score.percentComplete)}</b> of {score.requirementCount} requirements assessed ·
            last changed {new Date(assessment.updatedAt).toLocaleString()}
          </p>
          <label className="small" style={{ display: 'block', maxWidth: '32rem' }}>
            Organisation label (optional — used only in the export filename, stored locally)
            <input
              type="text"
              value={assessment.orgLabel ?? ''}
              onChange={(e) => setOrgLabel(e.target.value)}
              placeholder="e.g. Acme Widgets"
              style={{
                display: 'block',
                width: '100%',
                marginTop: '0.25rem',
                padding: '0.3rem 0.5rem',
              }}
            />
          </label>
          <p className="tiny faint" style={{ marginTop: '0.4rem' }}>
            Leave it blank and exports are named neutrally (
            <span className="mono">{exportFilename(assessment)}</span>).
          </p>
        </section>

        <section className="card">
          <h2>Export</h2>
          <div className="alert alert--warn" style={{ marginBottom: '0.75rem' }}>
            An export file contains your complete assessment, including notes. Handle it the way you
            would handle your System Security Plan: it is a map of your gaps.
          </div>
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={onExport}>
              Export assessment (JSON)
            </button>
            <button type="button" className="btn" onClick={onEvidenceExport}>
              Export evidence request list (text)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadText(
                  `ots-objectives-${new Date().toISOString().slice(0, 10)}.csv`,
                  otsExportCsv(assessment),
                  'text/csv',
                )
              }
            >
              Export other-than-satisfied objectives (CSV)
            </button>
          </div>
          <p className="tiny faint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            The CSV mirrors the source database&rsquo;s <span className="mono">Qry_OTS</span>: one
            row per objective you have marked not met, ordered family → requirement → objective.
          </p>
        </section>

        <section className="card">
          <h2>Import</h2>
          <p className="small muted">
            Importing replaces the assessment currently in this browser. Files written against a
            different catalogue build are accepted, but entries that no longer match a requirement
            are dropped and reported.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            data-testid="import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
        </section>

        <section className="card">
          <h2>Clear</h2>
          <p className="small muted">
            Resets every requirement to unassessed and returns the score to {score.maxScore} at 0%
            complete. This cannot be undone.
          </p>
          {confirmingClear ? (
            <div className="row">
              <span className="small">
                <b>Delete the whole assessment?</b>
              </span>
              <button
                type="button"
                className="btn btn--danger"
                data-testid="confirm-clear"
                onClick={() => {
                  clear();
                  setConfirmingClear(false);
                  setMessage({ kind: 'ok', lines: ['Assessment cleared.'] });
                }}
              >
                Yes, clear everything
              </button>
              <button type="button" className="btn" onClick={() => setConfirmingClear(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--danger"
              data-testid="clear"
              onClick={() => setConfirmingClear(true)}
            >
              Clear assessment
            </button>
          )}
        </section>

        <section className="card">
          <h2>Build details</h2>
          <table className="data">
            <tbody>
              <tr>
                <td>Catalogue revision</td>
                <td>{CATALOGUE_META.revision}</td>
              </tr>
              <tr>
                <td>Requirements / objectives</td>
                <td>
                  {CATALOGUE_META.requirementCount} / {CATALOGUE_META.objectiveCount}
                </td>
              </tr>
              <tr>
                <td>Catalogue SHA-256</td>
                <td className="mono tiny">{CATALOGUE_META.catalogueHash}</td>
              </tr>
              <tr>
                <td>Storage key</td>
                <td className="mono tiny">cmmc-sa:v1:assessment</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
