import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Gotcha P: GitHub Pages project sites are served from /<repo>/, and a bare
// "/assets/…" 404s there. Rather than depend on the deploy workflow injecting
// the right absolute base, default to RELATIVE asset URLs, which are correct at
// the domain root, at any subpath, and from file://. HashRouter means routing
// never touches the document path, so relative base is unambiguously safe.
// BASE_PATH remains available as an override.
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'esnext',
    // Assessment data never leaves the browser; sourcemaps are just weight.
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // node:sqlite oracle needs the real Node runtime, not jsdom's fetch shims.
    pool: 'forks',
  },
});
