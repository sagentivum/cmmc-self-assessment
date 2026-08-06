/** View-level tests: PLAN §7 test 42 (disclaimer in all three views) plus the
 *  gotchas that are only observable in the rendered DOM. */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DisclaimerBar, Header } from '../src/components/Chrome';
import { AssessView } from '../src/views/assess/AssessView';
import { EvidenceView } from '../src/views/evidence/EvidenceView';
import { ScoreView } from '../src/views/score/ScoreView';
import { useStore } from '../src/state/store';
import { emptyAssessment } from '../src/state/schema';
import { CATALOGUE_META } from '../src/generated/catalogue.meta';
import { CATALOGUE } from '../src/domain/catalogue';

function mount(path: string, element: React.ReactElement, routePath = path): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DisclaimerBar />
      <Header />
      <Routes>
        <Route path={routePath} element={element} />
      </Routes>
    </MemoryRouter>,
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

describe('42: the disclaimer renders in the chrome of all three views', () => {
  const cases: [string, () => React.ReactElement, string][] = [
    ['/assess', () => <AssessView />, '/assess'],
    ['/evidence', () => <EvidenceView />, '/evidence'],
    ['/score', () => <ScoreView />, '/score'],
  ];

  for (const [path, element, routePath] of cases) {
    it(`${path} shows unofficial + not-affiliated + Rev 2 + not-SPRS`, () => {
      mount(path, element(), routePath);
      const bar = screen.getByTestId('disclaimer-bar');
      expect(bar).toHaveTextContent(/Unofficial/i);
      expect(bar).toHaveTextContent(/Not affiliated with, endorsed by, or approved by/i);
      expect(bar).toHaveTextContent(/NIST SP 800-171 Revision 2/);
      expect(bar).toHaveTextContent(/not.*a submission to SPRS/i);
    });
  }

  it('gotcha A: the header never shows the score without completeness beside it', () => {
    mount('/score', <ScoreView />);
    const headerScore = screen.getByTestId('header-score');
    expect(headerScore).toHaveTextContent('110');
    expect(headerScore).toHaveTextContent(/assessed/);
    expect(headerScore).toHaveTextContent('0%');
  });
});

describe('Assess view', () => {
  it('renders the partial control ONLY for 3.5.3 and 3.13.11', () => {
    mount('/assess/3.5', <AssessView />, '/assess/:family');
    const partialEligible = screen.getByTestId('status-3.5.3').closest('.reqrow')!;
    expect(within(partialEligible as HTMLElement).getByRole('radio', { name: 'Partial' })).toBeInTheDocument();

    const other = screen.getByTestId('status-3.5.1').closest('.reqrow')!;
    expect(within(other as HTMLElement).queryByRole('radio', { name: 'Partial' })).toBeNull();
  });

  it('gotcha I: partial_rule is rendered verbatim and attributed', () => {
    mount('/assess/3.13', <AssessView />, '/assess/:family');
    const source = CATALOGUE.find((r) => r.requirement === '3.13.11')!.partialRule!;
    expect(screen.getByText(source)).toBeInTheDocument();
    expect(
      screen.getAllByText(/quoted verbatim from the source DCMA DIBCAC database/i).length,
    ).toBeGreaterThan(0);
  });

  it('distinguishes the 5 "do not deduct" notes from real partial credit', () => {
    mount('/assess/3.1', <AssessView />, '/assess/:family');
    // 3.1.12 carries a special-consideration rule but NO partial weight.
    const row = screen.getByTestId('status-3.1.12').closest('.reqrow') as HTMLElement;
    expect(within(row).getByText(/Do not deduct points if remote access not permitted/)).toBeInTheDocument();
    expect(within(row).getByText(/not-applicable/i)).toBeInTheDocument();
    expect(within(row).queryByRole('radio', { name: 'Partial' })).toBeNull();

    // 3.5.3 does carry partial credit and gets no such note.
    const { unmount } = render(
      <MemoryRouter initialEntries={['/assess/3.5']}>
        <Routes>
          <Route path="/assess/:family" element={<AssessView />} />
        </Routes>
      </MemoryRouter>,
    );
    const partialRow = screen.getAllByTestId('status-3.5.3')[0]!.closest('.reqrow') as HTMLElement;
    expect(within(partialRow).queryByText(/not-applicable/i)).toBeNull();
    unmount();
  });

  it('gotcha H: 3.12.4 shows its zero weight AND is flagged as still real work', () => {
    mount('/assess/3.12', <AssessView />, '/assess/:family');
    const row = screen.getByTestId('status-3.12.4').closest('.reqrow') as HTMLElement;
    expect(within(row).getByText(/0 pts — SSP/)).toBeInTheDocument();
    expect(within(row).getByText(/zero points/i)).toBeInTheDocument();
    expect(within(row).getByText(/8 assessment objectives/)).toBeInTheDocument();
  });

  it('setting a status updates the header score', async () => {
    const user = userEvent.setup();
    mount('/assess/3.1', <AssessView />, '/assess/:family');
    expect(screen.getByTestId('header-score-value')).toHaveTextContent('110');
    const row = screen.getByTestId('status-3.1.1').closest('.reqrow') as HTMLElement;
    await user.click(within(row).getByRole('radio', { name: 'Not satisfied' }));
    expect(screen.getByTestId('header-score-value')).toHaveTextContent('105');
  });

  it('gotcha B: requirement and objective DOM ids are namespaced apart', () => {
    mount('/assess/3.13/3.13.11', <AssessView />, '/assess/:family/:requirement');
    expect(document.getElementById('req:3.13.11')).not.toBeNull();
    expect(document.getElementById('obj:3.13.11')).not.toBeNull();
    expect(document.getElementById('3.13.11')).toBeNull();
  });

  it('gotcha O: a straight-quote search matches smart-quoted source text', async () => {
    const user = userEvent.setup();
    // 3.1.20's discussion contains “external” and organization’s — both with
    // typographic quotes. A user types straight ones.
    const smart = CATALOGUE.find((r) => r.requirement === '3.1.20')!;
    expect(smart.discussion).toMatch(/“external”/);
    expect(smart.discussion).toMatch(/organization’s direct supervision/);

    mount('/assess', <AssessView />);
    const box = screen.getByLabelText('Search requirements');
    await user.type(box, "organization's direct supervision");
    expect(screen.queryByText('Nothing matches those filters.')).toBeNull();
    expect(screen.getByTestId('status-3.1.20')).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, '"external"');
    expect(screen.getByTestId('status-3.1.20')).toBeInTheDocument();
  });
});

describe('Evidence view', () => {
  it('gotcha J: the n=1 bucket is not rendered as an empty-looking peer card', () => {
    mount('/evidence', <EvidenceView />);
    const solo = screen.getByTestId('bucket-artifact-and-screen-share');
    expect(solo).toHaveTextContent('Just 1 objective');
    expect(solo.className).toContain('bucket--singleton');
    expect(screen.getByTestId('bucket-physical-review')).toHaveTextContent('18');
  });

  it('gotcha G: every gloss is typographically marked as editorial', () => {
    mount('/evidence', <EvidenceView />);
    const editorial = document.querySelectorAll('.editorial');
    expect(editorial.length).toBeGreaterThan(0);
    for (const el of editorial) {
      expect(el.textContent).toMatch(/ours, not the source/i);
    }
    expect(screen.getByText(/no .typical questions asked. data/i)).toBeInTheDocument();
  });

  it('objective text keeps the source "Determine if…" framing', () => {
    mount('/evidence/physical-review', <EvidenceView />, '/evidence/:standardSlug');
    expect(screen.getAllByText('Determine if').length).toBe(18);
    expect(document.querySelectorAll('.objrow')).toHaveLength(18);
  });

  it('K: every frozen slug deep-links to a non-empty bucket', () => {
    for (const [slug, n] of [
      ['document', 126],
      ['screen-share', 93],
      ['artifact', 82],
      ['physical-review', 18],
      ['artifact-and-screen-share', 1],
    ] as const) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[`/evidence/${slug}`]}>
          <Routes>
            <Route path="/evidence/:standardSlug" element={<EvidenceView />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(document.querySelectorAll('.objrow').length, slug).toBe(n);
      unmount();
    }
  });
});

describe('Score view', () => {
  it('gotcha A: an untouched assessment says 110 means "no information"', () => {
    mount('/score', <ScoreView />);
    expect(screen.getByTestId('score-value')).toHaveTextContent('110');
    expect(screen.getByTestId('completeness-value')).toHaveTextContent('0%');
    expect(screen.getByTestId('blank-warning')).toHaveTextContent(/blank assessment scores 110/i);
  });

  it('a fully-satisfied assessment scores 110 with NO blank warning', () => {
    useStore.setState({
      assessment: {
        ...emptyAssessment(CATALOGUE_META.catalogueHash),
        requirements: Object.fromEntries(
          CATALOGUE.map((r) => [
            r.requirement,
            { status: 'satisfied' as const, poam: false, poamDate: null, updatedAt: '2026-01-01' },
          ]),
        ),
      },
    });
    mount('/score', <ScoreView />);
    expect(screen.getByTestId('score-value')).toHaveTextContent('110');
    expect(screen.getByTestId('completeness-value')).toHaveTextContent('100%');
    expect(screen.queryByTestId('blank-warning')).toBeNull();
  });

  it('shows the floor and ceiling as explicit range context', () => {
    mount('/score', <ScoreView />);
    expect(screen.getByText('floor -203')).toBeInTheDocument();
    expect(screen.getByText('ceiling 110')).toBeInTheDocument();
    expect(screen.getByText(/SPRS-methodology score, self-computed/i)).toBeInTheDocument();
  });

  it('gotcha H: the zero-weight SSP is surfaced even though it cannot rank', () => {
    mount('/score', <ScoreView />);
    const note = screen.getByText(/System Security Plan/);
    expect(note).toBeInTheDocument();
    expect(note.closest('.editorial')).not.toBeNull();
  });

  it('the waterfall spans zero explicitly when the score goes negative', () => {
    useStore.setState({
      assessment: {
        ...emptyAssessment(CATALOGUE_META.catalogueHash),
        requirements: Object.fromEntries(
          CATALOGUE.map((r) => [
            r.requirement,
            { status: 'not-satisfied' as const, poam: false, poamDate: null, updatedAt: '2026-01-01' },
          ]),
        ),
      },
    });
    mount('/score', <ScoreView />);
    expect(screen.getByTestId('score-value')).toHaveTextContent('-203');
    const svg = document.querySelector('svg.waterfall')!;
    const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toContain('0');
    expect(labels).toContain('110');
    expect(svg.getAttribute('aria-label')).toMatch(/down to -203/);
  });
});
