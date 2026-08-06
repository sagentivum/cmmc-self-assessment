import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';

/**
 * First-run interstitial. Deliberately blocking: the single most likely harm
 * from this tool is someone believing it is an official DoD product or an
 * SPRS submission channel, so that is what the interstitial is about.
 */
export function FirstRunNotice(): React.ReactElement | null {
  const acknowledged = useStore((s) => s.noticeAcknowledged);
  const acknowledge = useStore((s) => s.acknowledgeNotice);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!acknowledged) buttonRef.current?.focus();
  }, [acknowledged]);

  if (acknowledged) return null;

  return (
    <div className="modal-backdrop" data-testid="first-run-notice">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="frn-title">
        <h1 id="frn-title">Before you start — what this is, and what it is not</h1>

        <div className="stack" style={{ gap: '0.75rem' }}>
          <div className="alert alert--warn">
            This is an <b>unofficial</b>, independently built tool. It is <b>not affiliated with,
            endorsed by, or approved by</b> the Defense Contract Management Agency (DCMA), the DIBCAC,
            the Department of Defense, or any US Government agency. No government seal, logo, or
            branding appears anywhere in it, because none is authorised.
          </div>

          <p>
            The requirement, objective, weight and evidence data come from a{' '}
            <b>publicly released DCMA DIBCAC self-assessment database</b> (
            <span className="mono">Public_800-171_Self_Asmt_DB_v1.1.accdb</span>). Requirement text,
            discussions and scoring weights are reproduced from that public file. Everything else —
            layout, wording of headings, and any explanatory gloss — is ours and is marked as such.
          </p>

          <p>
            It covers <b>NIST SP 800-171 Revision 2</b>: 110 requirements, 320 assessment
            objectives. <b>Revision 3 restructures the catalogue</b> and is not represented here.
            Check which revision your contract actually invokes.
          </p>

          <p>
            The score is computed with the <b>SPRS methodology</b> (start at 110, deduct 1/3/5 per
            unmet requirement). It is a <b>self-computed estimate for your own planning</b>. It is{' '}
            <b>not</b> a submission, it is not transmitted anywhere, and it has no standing with any
            government system.
          </p>

          <div className="alert alert--info">
            <b>Your data stays in this browser.</b> There is no server, no account, and no analytics.
            The page makes zero network requests after it loads. Your assessment lives in this
            browser&rsquo;s local storage until you clear it — so use the export button to keep a
            copy, and treat that file as sensitive.
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.25rem' }}>
            <button
              ref={buttonRef}
              type="button"
              className="btn btn--primary"
              onClick={acknowledge}
              data-testid="acknowledge-notice"
            >
              I understand — this is unofficial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
