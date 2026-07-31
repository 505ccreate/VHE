import { defineConfig } from 'vitest/config';

// Discovery is scoped to project code ONLY. Without this, vitest's default glob
// walks library/tools/ (37k staged files — the directory CLAUDE.md forbids
// scanning) and runs the staged packages' own test suites. See VHE-ISSUE-LOG-0013.
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'library/**', 'vendor/**', '_BLUEPRINTS-TEXT/**'],
  },
});
