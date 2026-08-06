/** PLAN §7 tests 37-43: privacy and compliance. These are requirements, so
 *  they are tests. Several read the BUILT output, not just source. */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const APP = resolve(import.meta.dirname, '..');
const SRC = join(APP, 'src');
const DIST = join(APP, 'dist');

function walk(dir: string, filter: (p: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

const srcFiles = walk(SRC, (p) => /\.(ts|tsx|css)$/.test(p));

describe('37: no network primitives anywhere in src/', () => {
  const FORBIDDEN = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bsendBeacon\b/,
    /\bnew\s+WebSocket\b/,
    /\bnew\s+EventSource\b/,
    /\bnavigator\.connection\b/,
    /\bimportScripts\s*\(/,
  ];

  it('src/ contains no fetch, XHR, beacon, WebSocket or EventSource', () => {
    expect(srcFiles.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const f of srcFiles) {
      const text = readFileSync(f, 'utf8');
      for (const re of FORBIDDEN) {
        if (re.test(text)) offenders.push(`${relative(APP, f)} :: ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the catalogue is compiled in, not fetched — no runtime data URL exists', () => {
    const gen = readFileSync(join(SRC, 'generated/catalogue.ts'), 'utf8');
    expect(gen).toMatch(/export const CATALOGUE/);
    expect(gen).not.toMatch(/fetch|import\(/);
  });
});

describe('39: no analytics or telemetry dependency', () => {
  const BANNED =
    /(google-analytics|gtag|segment|mixpanel|amplitude|posthog|sentry|bugsnag|rollbar|datadog|logrocket|hotjar|fullstory|plausible|fathom|matomo|newrelic|@vercel\/analytics|firebase)/i;

  it('package.json dependency lists are clean', () => {
    const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names.filter((n) => BANNED.test(n))).toEqual([]);
    // Runtime deps are a short, auditable allowlist.
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      'react',
      'react-dom',
      'react-router-dom',
      'zod',
      'zustand',
    ]);
  });
});

describe('40: index.html ships a CSP meta with connect-src none', () => {
  const html = readFileSync(join(APP, 'index.html'), 'utf8');

  it('has the meta tag', () => {
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/);
  });

  it("includes connect-src 'none'", () => {
    expect(html).toMatch(/connect-src 'none'/);
  });

  it('has no external origins and no inline script', () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/);
  });

  it('locks down the other fetch-capable directives too', () => {
    for (const d of [
      "default-src 'none'",
      "script-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(html).toContain(d);
    }
  });
});

describe('41: no DoD / DCMA branding anywhere', () => {
  const BRANDING = /\b(dod|dcma|dibcac|seal|eagle|insignia|emblem|crest)\b/i;

  it('no asset filename in public/ or src/ matches the branding pattern', () => {
    const assets = [
      ...walk(join(APP, 'public'), () => true),
      ...walk(SRC, (p) => /\.(svg|png|jpg|jpeg|gif|webp|ico|avif)$/i.test(p)),
    ];
    expect(assets.filter((p) => BRANDING.test(p))).toEqual([]);
  });

  it('no alt text or image title claims government branding', () => {
    const offenders: string[] = [];
    for (const f of srcFiles) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\balt\s*=\s*["'{]([^"'}]*)["'}]/g)) {
        if (BRANDING.test(m[1] ?? '')) offenders.push(`${relative(APP, f)}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('mentions of DCMA/DoD in copy are only ever disclaimers or provenance', () => {
    // The words DO appear — they must, to disclaim. What must NOT appear is any
    // claim of endorsement.
    const all = srcFiles
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
      .replace(/\s+/g, ' ');
    expect(all).toMatch(/not affiliated with/i);
    expect(all).not.toMatch(/official (DoD|DCMA|Government) (tool|application|app)/i);
    expect(all).not.toMatch(/\bapproved for (DoD|Government) use\b/i);

    // Every endorsement verb must sit inside a negation, not a claim.
    for (const m of all.matchAll(
      /\b(endorsed|approved|authorized|authorised|certified|sponsored)\b[^.]{0,80}?\b(DoD|DCMA|DIBCAC|Department of Defense|Defense Contract Management Agency|US Government)\b/gi,
    )) {
      const start = Math.max(0, m.index - 160);
      const context = all.slice(start, m.index + m[0].length);
      expect(
        /\bnot\b|\bno\b|\bnever\b|\bnone\b/i.test(context),
        `un-negated endorsement claim: "${context.slice(-140)}"`,
      ).toBe(true);
    }
  });
});

describe('42: the disclaimer is everywhere it needs to be', () => {
  it('the shared disclaimer string carries all four required claims', () => {
    const schema = readFileSync(join(SRC, 'state/schema.ts'), 'utf8');
    expect(schema).toMatch(/UNOFFICIAL TOOL/);
    expect(schema).toMatch(/Not affiliated with/i);
    expect(schema).toMatch(/Revision 2/);
    expect(schema).toMatch(/NOT a submission to SPRS/);
  });

  it('the persistent banner is mounted outside the route switch', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    const banner = app.indexOf('<DisclaimerBar');
    const routes = app.indexOf('<Routes>');
    expect(banner).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(routes);
  });
});

/* ------------------------------------------------------- built-output tests */

const distExists = existsSync(join(DIST, 'index.html'));

describe.runIf(distExists)('38 / 43: the built dist/ output', () => {
  const html = distExists ? readFileSync(join(DIST, 'index.html'), 'utf8') : '';
  const jsFiles = walk(join(DIST, 'assets'), (p) => p.endsWith('.js'));
  const cssFiles = walk(join(DIST, 'assets'), (p) => p.endsWith('.css'));
  const bundle = [...jsFiles, ...cssFiles].map((f) => readFileSync(f, 'utf8')).join('\n');

  /**
   * Origins allowed to appear as literal strings in the bundle. None of these
   * is ever requested — `connect-src 'none'` makes that structurally true.
   * Each entry needs a reason.
   */
  const ORIGIN_ALLOWLIST = [
    'http://www.w3.org/2000/svg', // XML namespace constants (React DOM)
    'http://www.w3.org/1999/xhtml',
    'http://www.w3.org/1999/xlink',
    'http://www.w3.org/1998/Math/MathML',
    'http://www.w3.org/XML/1998/namespace',
    'http://localhost', // react-router's fallback origin for URL parsing
    'https://reactrouter.com/', // text inside a react-router error message
    'https://react.dev',
    'https://reactjs.org',
    'https://www.gsaadvantage.gov', // appears verbatim in DCMA requirement text
  ];

  it('38: no external origin outside the allowlist appears in the bundle', () => {
    const found = new Set<string>();
    for (const m of bundle.matchAll(/https?:\/\/[^\s"'`)\\]+/g)) {
      const url = m[0];
      if (!ORIGIN_ALLOWLIST.some((a) => url.startsWith(a))) found.add(url);
    }
    expect([...found]).toEqual([]);
  });

  it('38b: no network primitive survives into the bundle', () => {
    // React DOM does not ship fetch/XHR; if this ever trips, a dependency
    // started phoning home.
    expect(bundle).not.toMatch(/\bnavigator\.sendBeacon\b/);
    expect(bundle).not.toMatch(/\bnew WebSocket\b/);
    expect(bundle).not.toMatch(/\bnew EventSource\b/);
    expect(bundle).not.toMatch(/new XMLHttpRequest/);
  });

  it('38c: the built index.html still carries the CSP', () => {
    expect(html).toMatch(/connect-src 'none'/);
  });

  it('43: built asset URLs are subpath-relative, not absolute /assets/ roots', () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
    const assetRefs = refs.filter((r) => r.includes('assets/'));
    expect(assetRefs.length).toBeGreaterThan(0);
    for (const r of assetRefs) {
      // Either relative ("./assets/…") or prefixed with the configured base
      // ("/cmmc-self-assessment/assets/…"). Never a bare "/assets/…", which is
      // exactly what breaks a GitHub Pages project subpath.
      expect(r, `asset ref ${r} is rooted at / and will 404 under a subpath`).not.toMatch(
        /^\/assets\//,
      );
    }
  });

  it('P: .nojekyll ships so GitHub Pages does not eat underscore paths', () => {
    expect(existsSync(join(DIST, '.nojekyll'))).toBe(true);
  });

  it('T: the sqlite oracle is never shipped to the browser', () => {
    expect(walk(DIST, (p) => /\.(sqlite|db|accdb)$/i.test(p))).toEqual([]);
    expect(bundle).not.toMatch(/cmmc\.sqlite/);
  });
});
