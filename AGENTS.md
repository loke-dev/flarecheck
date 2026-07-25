# FlareCheck repository instructions

FlareCheck is a TypeScript CLI, npm package, and GitHub Action that statically
checks Cloudflare Workers configuration. The `site/` directory is its separate
documentation website.

- Use Node.js 20+ and the pnpm version declared in `package.json`; do not
  introduce another package manager.
- Keep checks deterministic and offline. The CLI must not require Cloudflare
  credentials or upload scanned source.
- Every rule change must cite authoritative Cloudflare behavior in user-facing
  documentation, cover healthy and risky cases in tests or fixtures, and
  explain the production consequence.
- Preserve the CLI exit-code contract, JSON output shape, GitHub annotation
  behavior, and the inputs exposed by `action.yml`.
- Change source in `src/`; do not edit generated `dist/`, coverage, or Wrangler
  state.
- Run `pnpm check` for CLI, rule, package, or Action changes. Run
  `pnpm site:build` for documentation-site changes.
- Treat npm releases, tags, and manual deployments as explicit actions. Never
  commit credentials, `.dev.vars`, local environment files, or Cloudflare
  state.
