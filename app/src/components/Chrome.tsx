import { NavLink, Link } from 'react-router-dom';
import { useScore } from '../lib/useScore';
import { pct } from '../lib/format';
import { useStore } from '../state/store';

/**
 * Constraint §10: the unofficial / not-DoD-affiliated notice and the Rev 2
 * notice are permanent chrome, not a dismissible toast. Rendered above the
 * header so it is present on every route including deep links.
 */
export function DisclaimerBar(): React.ReactElement {
  return (
    <div className="disclaimer-bar" role="note" data-testid="disclaimer-bar">
      <div className="disclaimer-bar__inner">
        <strong>Unofficial</strong>
        <span>
          Independent tool built from a <em>public</em> DCMA DIBCAC file.{' '}
          <b>Not affiliated with, endorsed by, or approved by DCMA, the DoD, or any US Government
          agency.</b>{' '}
          Covers <b>NIST SP 800-171 Revision 2</b> (110 requirements) — Revision 3 restructures the
          catalogue. Scores are self-computed estimates, <b>not</b> a submission to SPRS.{' '}
          <Link to="/about">How this works &amp; what it is not →</Link>
        </span>
      </div>
    </div>
  );
}

export function Header(): React.ReactElement {
  const score = useScore();
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link to="/assess" className="brand">
          <span className="brand__title">NIST SP 800-171 Rev 2 Self-Assessment</span>
          <span className="brand__sub">Unofficial · runs entirely in your browser</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/assess" className={({ isActive }) => (isActive ? 'active' : '')}>
            Assess
          </NavLink>
          <NavLink to="/evidence" className={({ isActive }) => (isActive ? 'active' : '')}>
            Evidence
          </NavLink>
          <NavLink to="/score" className={({ isActive }) => (isActive ? 'active' : '')}>
            Score
          </NavLink>
          <NavLink to="/data" className={({ isActive }) => (isActive ? 'active' : '')}>
            Data
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => (isActive ? 'active' : '')}>
            About
          </NavLink>
        </nav>
        {/* Gotcha A: score and completeness are never shown apart. */}
        <Link to="/score" className="header-score" data-testid="header-score">
          <span>
            <span className="header-score__num" data-testid="header-score-value">
              {score.score}
            </span>{' '}
            <span className="header-score__lbl">/ 110</span>
          </span>
          <span className="header-score__lbl">
            {pct(score.percentComplete)}
            <br />
            assessed
          </span>
        </Link>
      </div>
    </header>
  );
}

export function StorageWarning(): React.ReactElement | null {
  const available = useStore((s) => s.storageAvailable);
  if (available) return null;
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className="alert alert--warn" role="alert">
        <b>Browser storage is unavailable</b> (private browsing, or storage is full). Your work is
        being held in memory only and <b>will be lost when you close this tab</b>. Export to a file
        before you finish.
      </div>
    </div>
  );
}
