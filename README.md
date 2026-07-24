# FlareCheck

Production-readiness checks for Cloudflare Workers projects.

[Website](https://flarecheck.loke.dev) · [Report a finding](https://github.com/loke-dev/flarecheck/issues)

FlareCheck catches Cloudflare configuration risks that builds and type checks
cannot see: committed secrets, non-inherited environment bindings, ambiguous
deployment commands, stale compatibility dates, and missing observability.

```console
$ npx flarecheck

FlareCheck v0.1.0
/work/api/wrangler.jsonc

Production readiness: 72/100

✗ ERROR FC003  Likely secret committed as API_KEY
  vars.API_KEY looks sensitive and will be stored in source control.
  Fix: Remove API_KEY from vars and store it with "wrangler secret put API_KEY".

! WARNING FC005  staging is missing non-inherited bindings
  d1_databases is defined at the root but not in env.staging.
  Fix: Declare the intended d1_databases values inside env.staging.
```

## Run it

FlareCheck supports `wrangler.jsonc`, `wrangler.json`, and `wrangler.toml`.

```sh
npx flarecheck
npx flarecheck ./apps/api
npx flarecheck --json
npx flarecheck --strict
```

Until the npm package is published, run the GitHub release directly:

```sh
npx github:loke-dev/flarecheck
```

Exit codes are designed for CI:

- `0`: no errors, and no warnings when `--strict` is enabled
- `1`: invalid configuration, or warnings with `--strict`
- `2`: production-readiness errors

## Checks in v0.1

| Rule | Check |
| --- | --- |
| `FC001` | Compatibility date exists, is valid, and is not stale |
| `FC002` | `nodejs_compat` is enabled |
| `FC003` | Likely secrets are not committed in `vars` |
| `FC004` | Workers observability and sampling are intentional |
| `FC005` | Every environment declares its non-inherited bindings |
| `FC006` | Deployment scripts select a configured environment |
| `FC007` | Wrangler uses Cloudflare's recommended JSONC format |

Rules are deterministic, documented, and designed to favor useful findings over
volume. FlareCheck never uploads source code or requires Cloudflare credentials.

## Development

```sh
pnpm install
pnpm check
pnpm dev -- ./tests/fixtures/risky
pnpm site:dev
```

## Contributing

Rules must point to authoritative Cloudflare documentation, include a fixture,
and explain the production consequence. Please open an issue before implementing
a broad or framework-specific rule.

## License

MIT
