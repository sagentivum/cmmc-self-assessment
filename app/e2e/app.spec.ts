/** PLAN §7 tests 44-47. Four E2E tests, all against the built output served
 *  from a repository-style subpath. */
import { expect, test, type Page, type Request, type Response } from '@playwright/test';

const acknowledge = async (page: Page): Promise<void> => {
  const button = page.getByTestId('acknowledge-notice');
  if (await button.isVisible()) await button.click();
  await expect(page.getByTestId('first-run-notice')).toHaveCount(0);
};

test('44: acknowledge, mark 3.1.1 not satisfied, score 105, survives reload', async ({ page }) => {
  await page.goto('#/assess/3.1');

  // The unofficial / Rev 2 notice is the first thing on the page.
  await expect(page.getByTestId('first-run-notice')).toBeVisible();
  await expect(page.getByTestId('first-run-notice')).toContainText('not affiliated with');
  await acknowledge(page);

  // Permanent disclaimer bar, present on every route.
  await expect(page.getByTestId('disclaimer-bar')).toContainText('Revision 2');
  await expect(page.getByTestId('disclaimer-bar')).toContainText('Not affiliated with');

  await expect(page.getByTestId('header-score-value')).toHaveText('110');

  const row = page.locator('[data-requirement="3.1.1"]');
  await row.getByRole('radio', { name: 'Not satisfied' }).click();
  await expect(page.getByTestId('status-3.1.1')).toHaveText('Not satisfied');
  await expect(page.getByTestId('header-score-value')).toHaveText('105');

  await page.goto('#/score');
  await expect(page.getByTestId('score-value')).toHaveText('105');
  await expect(page.getByTestId('completeness-value')).toHaveText('0.9%');

  await page.reload();
  await expect(page.getByTestId('score-value')).toHaveText('105');
});

test('45: export downloads a file; clear resets; import restores', async ({ page }) => {
  await page.goto('#/assess/3.1');
  await acknowledge(page);
  await page.locator('[data-requirement="3.1.1"]').getByRole('radio', { name: 'Not satisfied' }).click();
  await expect(page.getByTestId('header-score-value')).toHaveText('105');

  await page.goto('#/data');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export assessment (JSON)' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  expect(download.suggestedFilename()).toMatch(/^cmmc-self-assessment-\d{4}-\d{2}-\d{2}\.json$/);

  await page.getByTestId('clear').click();
  await page.getByTestId('confirm-clear').click();
  await expect(page.getByTestId('header-score-value')).toHaveText('110');

  await page.getByTestId('import-input').setInputFiles(path!);
  await expect(page.getByTestId('data-message')).toContainText('Assessment imported');
  await expect(page.getByTestId('header-score-value')).toHaveText('105');
});

test('46: deep link #/evidence/physical-review renders 18 objectives', async ({ page }) => {
  await page.goto('#/evidence/physical-review');
  await acknowledge(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Physical Review' })).toBeVisible();
  await expect(page.locator('.objrow')).toHaveCount(18);

  // Gotcha J: the n = 1 bucket must not render as a broken-looking peer card.
  await page.goto('#/evidence');
  await expect(page.getByTestId('bucket-artifact-and-screen-share')).toContainText(
    'Just 1 objective',
  );
  await page.goto('#/evidence/artifact-and-screen-share');
  await expect(page.locator('.objrow')).toHaveCount(1);
  await expect(page.locator('.objrow')).toContainText('3.13.11');
});

test('47: boots from a subpath with zero 404s and zero cross-origin requests', async ({ page }) => {
  const failures: string[] = [];
  const crossOrigin: string[] = [];
  const consoleErrors: string[] = [];

  const origin = 'http://localhost:4317';

  page.on('request', (r: Request) => {
    const url = new URL(r.url());
    if (url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:') {
      crossOrigin.push(r.url());
    }
  });
  page.on('response', (r: Response) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r: Request) => failures.push(`FAILED ${r.url()}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  // Route interception: hard-fail anything leaving the origin.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      crossOrigin.push(route.request().url());
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('#/assess');
  await acknowledge(page);
  await page.goto('#/evidence/document');
  await page.goto('#/score');
  await page.goto('#/about');
  await page.waitForTimeout(500);

  expect(failures, `unexpected non-200 responses: ${failures.join(', ')}`).toEqual([]);
  expect(crossOrigin, `cross-origin requests: ${crossOrigin.join(', ')}`).toEqual([]);
  expect(
    consoleErrors.filter((e) => !/Content Security Policy|favicon/i.test(e)),
    `console errors: ${consoleErrors.join(' | ')}`,
  ).toEqual([]);

  // The page really is under the subpath, and assets resolved relative to it.
  expect(page.url()).toContain('/cmmc-self-assessment/');
  const scriptSrc = await page.locator('script[type=module]').first().getAttribute('src');
  expect(scriptSrc).not.toMatch(/^\/assets\//);
});
