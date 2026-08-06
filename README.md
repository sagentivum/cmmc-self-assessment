# NIST SP 800-171 Rev 2 / CMMC self-assessment (unofficial)

A fully static, offline-capable self-assessment tool for the 110 requirements and
320 assessment objectives of **NIST SP 800-171 Revision 2**, with SPRS-methodology
scoring (start at 110, deduct 1/3/5; floor −203).

> **This is an unofficial tool.** It is not affiliated with, endorsed by, or
> approved by DCMA, the DIBCAC, the Department of Defense, or any US Government
> agency. No government seal, logo, or branding is used anywhere in it. The score
> it computes is a self-computed estimate for your own planning — it is **not** a
> submission to SPRS and has no standing with any government system. Revision 3
> restructures the catalogue and is not represented here.

**Your data never leaves your browser.** There is no server, no account, no
analytics, and no runtime network request of any kind — the page ships a CSP with
`connect-src 'none'` and the requirement catalogue is compiled into the JavaScript
bundle rather than fetched. Assessments live in `localStorage` with JSON
export/import.

## Provenance

All requirement text, weights, objectives and evidence standards come from the
publicly released DCMA DIBCAC `Public_800-171_Self_Asmt_DB_v1.1.accdb`. The
extraction pipeline is in `extract/`; its output is `data/catalogue.json`
(source of truth, compiled into the app) and `data/cmmc.sqlite` (test oracle
only — never shipped to a browser).

Scoring transliterates the source database's `Qry_Summary` cascade exactly, and a
test diffs the TypeScript engine against that SQL running on `data/cmmc.sqlite`
via Node 24's built-in `node:sqlite` over 500 randomised assessments.

## Layout

```
data/catalogue.json          source of truth (committed — it is the point)
data/cmmc.sqlite             test oracle only
extract/                     the one-off .accdb extraction pipeline
app/                         the Vite + React + TypeScript application
  scripts/gen-catalogue.mts  build-time codegen with Zod validation
  src/scoring/engine.ts      pure scoring engine (no React, no Date.now)
  tests/                     invariants, properties, oracle, privacy
  e2e/                       Playwright, run against the built output
.github/workflows/deploy.yml build + test + GitHub Pages deploy
```

## Development

Requires Node 24 and pnpm 10.

```bash
cd app
pnpm install
pnpm run gen        # regenerate src/generated from data/catalogue.json
pnpm test           # invariants, scoring properties, oracle diff, privacy
pnpm run build      # typecheck + production build to app/dist
pnpm run preview    # serve the built output
pnpm run e2e        # Playwright, including a subpath / zero-404 check
```

`pnpm run gen` must be a no-op on a clean tree; CI enforces that, so silent data
drift fails the build rather than the UI.

## Deployment status

`.github/workflows/deploy.yml` builds, lints, typechecks, runs the full unit +
property + oracle + E2E suite, and publishes `app/dist` to GitHub Pages. The
**build job passes**; the **Pages deployment does not currently complete**.

This is an account-level GitHub Pages fault, not a fault in this project:

- `actions/deploy-pages@v4` sits in `deployment_queued` and is aborted by its
  own timeout, across four separate runs.
- Switching to branch-based (legacy) Pages from a `gh-pages` branch fails the
  same way — `Page build failed` after ~10 minutes.
- A control repository (`sagentivum/pages-probe`) containing nothing but a
  45-byte `index.html` and `.nojekyll`, served from `main` at `/`, **also**
  fails with `Page build failed`. Nothing about the artifact is implicated.
- `sagentivum.github.io` resolves correctly (185.199.108–111.153) and TLS
  terminates, so this is not DNS or certificate provisioning.
- githubstatus.com reported all systems operational throughout.

Resolving it requires action on the GitHub account itself (support ticket, or
whatever account state is blocking Pages builds). Once Pages builds work, this
repository needs no changes — push to `main` and the existing workflow ships it.

To verify the build locally in the meantime, exactly as it would be served from
the `/cmmc-self-assessment/` subpath:

```bash
cd app
pnpm install && pnpm run build
node e2e/serve-subpath.mjs   # http://localhost:4317/cmmc-self-assessment/
```

## Licence

MIT for the application code. The catalogue is a derived US Government work — see
`LICENSE` for the provenance note.
