# minimal-repo

Minimal TypeScript fixture used as the substrate for the sk-* engineering toolchain manual smokes. Ships a single `add(a, b)` function in `src/index.ts` and one passing Vitest test in `src/index.test.ts`. Gates (`typecheck`, `lint`, `test`) are wired through `pnpm` so the `.sidekick/config.json` defaults map cleanly onto runnable commands.

This README only describes the fixture itself. The end-to-end smoke procedure (copy into a tmpdir, install the sidekick harness, drive `/sk-decide` / `/sk-design` / `/sk-build` inside Claude Code) lives two levels up at `smokes/README.md`.
