# CONTEXT.md

## Build, Lint, and Test

- **Monorepo build:** `pnpm build` (uses TurboRepo, runs `turbo build`)
- **Monorepo test:** `pnpm test` (runs all packages recursively)
- **Package build:** Run `pnpm build` in the target package directory (e.g., `packages/admin`)
- **Lint:** No dedicated `lint` script; ESLint is set up via `eslint-plugin-mmkal` and flat config, e.g.:
  - `npx eslint .` (in any package, e.g., `packages/admin`)
- **Single test file:** From a package such as `admin` or `typegen`, use:
  - `pnpm test -- --testFile=test/filename.test.ts`
  - Or, with Vitest: `npx vitest run path/to/file.test.ts`
- **E2E/browser tests:** Inside `packages/admin`, use `pnpm e2e` (runs Playwright tests)
- **Typegen CLI:** `npx pgkit-typegen generate` (from root, or within `typegen`)

## Code Style Guidelines

- **Imports:** Prefer absolute imports via path aliases (`@/*` for `src`) and use ES modules.
- **Formatting:** Autoformat with Prettier if present; otherwise use default VSCode or Prettier settings (2-space indent).
- **Linting:** Follows `eslint-plugin-mmkal` recommendations. TypeScript strict mode enabled.
- **Types:** Use explicit types where possible, leverage `sql<T>` tagging for query result types. Namespaces are allowed in `typegen`.
- **Exports:** Use `export` over `module.exports` except for flat ESLint config.
- **Naming:** camelCase for variables/functions, PascalCase for types/interfaces, UPPER_SNAKE_CASE for env/constants.
- **Error Handling:** Prefer descriptive errors. Wrap and rethrow with context where needed (`cause:` is often used). Log errors with context.
- **Testing:** Use `vitest` for unit/integration, Playwright for E2E. Prefer `test()`/`expect()` from Vitest.
- **React:** Use function components, TypeScript, `react-jsx` runtime.
- **Styling:** Tailwind CSS for frontend, use tailwind-merge for class string composition.
- **Other:** Avoid disabling rules unless justified. Use snapshot testing for Vitest where helpful.

---

If you have additional workspace rules, configs, or new package-specific tooling, append them below. This summary enables agentic automation and consistent workflows.
