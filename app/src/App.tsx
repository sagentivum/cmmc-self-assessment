import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DisclaimerBar, Header, StorageWarning } from './components/Chrome';
import { FirstRunNotice } from './components/FirstRunNotice';
import { AboutView } from './views/about/AboutView';
import { DataView } from './views/data/DataView';
import { AssessView } from './views/assess/AssessView';
import { EvidenceView } from './views/evidence/EvidenceView';
import { ScoreView } from './views/score/ScoreView';

/**
 * Gotcha P: HashRouter, not BrowserRouter. GitHub Pages project sites have no
 * rewrite rule, so a deep link under BrowserRouter 404s unless you ship the
 * 404.html copy hack. Hashes cost nothing and remove the failure mode.
 */
export function App(): React.ReactElement {
  return (
    <HashRouter>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <DisclaimerBar />
      <Header />
      <StorageWarning />
      <FirstRunNotice />
      <Routes>
        <Route path="/" element={<Navigate to="/assess" replace />} />
        <Route path="/assess" element={<AssessView />} />
        <Route path="/assess/:family" element={<AssessView />} />
        <Route path="/assess/:family/:requirement" element={<AssessView />} />
        <Route path="/evidence" element={<EvidenceView />} />
        <Route path="/evidence/:standardSlug" element={<EvidenceView />} />
        <Route path="/score" element={<ScoreView />} />
        <Route path="/data" element={<DataView />} />
        <Route path="/about" element={<AboutView />} />
        <Route path="*" element={<Navigate to="/assess" replace />} />
      </Routes>
    </HashRouter>
  );
}
