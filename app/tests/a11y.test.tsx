/** PLAN §8 phase 9: an axe pass over each view. */
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axe from 'axe-core';
import { DisclaimerBar, Header } from '../src/components/Chrome';
import { FirstRunNotice } from '../src/components/FirstRunNotice';
import { AssessView } from '../src/views/assess/AssessView';
import { EvidenceView } from '../src/views/evidence/EvidenceView';
import { ScoreView } from '../src/views/score/ScoreView';
import { AboutView } from '../src/views/about/AboutView';
import { DataView } from '../src/views/data/DataView';
import { useStore } from '../src/state/store';
import { emptyAssessment } from '../src/state/schema';
import { CATALOGUE_META } from '../src/generated/catalogue.meta';

/** jsdom has no layout engine, so contrast and other geometry-dependent rules
 *  cannot be evaluated here. Everything structural can. */
const RULES: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  rules: { 'color-contrast': { enabled: false } },
};

async function check(node: HTMLElement): Promise<string[]> {
  const results = await axe.run(node, RULES);
  return results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`,
  );
}

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    assessment: emptyAssessment(CATALOGUE_META.catalogueHash),
    noticeAcknowledged: true,
    storageAvailable: true,
    lastImport: null,
  });
});

const views: [string, string, () => React.ReactElement][] = [
  ['assess', '/assess/3.5/3.5.3', () => <AssessView />],
  ['evidence buckets', '/evidence', () => <EvidenceView />],
  ['evidence bucket', '/evidence/physical-review', () => <EvidenceView />],
  ['score', '/score', () => <ScoreView />],
  ['about', '/about', () => <AboutView />],
  ['data', '/data', () => <DataView />],
];

describe('accessibility (axe-core, structural rules)', () => {
  for (const [name, path, element] of views) {
    it(`${name} has no WCAG A/AA violations`, async () => {
      const routePath = path
        .replace('/3.5/3.5.3', '/:family/:requirement')
        .replace('/physical-review', '/:standardSlug');
      const { container } = render(
        <MemoryRouter initialEntries={[path]}>
          <DisclaimerBar />
          <Header />
          <Routes>
            <Route path={routePath} element={element()} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await check(container)).toEqual([]);
    }, 30_000);
  }

  it('the first-run interstitial is a labelled modal dialog', async () => {
    useStore.setState({ noticeAcknowledged: false });
    const { container } = render(
      <MemoryRouter>
        <FirstRunNotice />
      </MemoryRouter>,
    );
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(await check(container)).toEqual([]);
  }, 30_000);
});
