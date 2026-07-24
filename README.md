# FlareCheck

Production-readiness checks for Cloudflare Workers projects.

[Website](https://flarecheck.loke.dev) · [Report a finding](https://github.com/loke-dev/flarecheck/issues)

FlareCheck catches Cloudflare configuration risks that builds and type checks
cannot see: committed secrets, non-inherited environment bindings, ambiguous
deployment commands, stale compatibility dates, and missing observability.

```console
$ npx flarecheck

FlareCheck v0.6.0
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
npx flarecheck --list-rules
npx flarecheck --only FC003,FC005
npx flarecheck . --all
npx flarecheck --sarif > flarecheck.sarif
```

Exit codes are designed for CI:

- `0`: no errors, and no warnings when `--strict` is enabled
- `1`: invalid configuration, or warnings with `--strict`
- `2`: production-readiness errors

### GitHub Actions

Use the GitHub output format to turn findings into file annotations on the
workflow run:

```yaml
- name: Check Worker configuration
  run: npx flarecheck --format github --strict
```

`--github` is a shorter alias for `--format github`.

### Adopt rules incrementally

List the stable rule IDs, run a focused subset, or temporarily skip rules that
are not relevant to a project:

```sh
npx flarecheck --list-rules
npx flarecheck --only FC003,FC005
npx flarecheck --ignore FC002
```

`--only` and `--ignore` are mutually exclusive, reject unknown rule IDs, and
accept comma-separated IDs case-insensitively.

### Scan a monorepo

Use `--all` to recursively discover and scan every Wrangler configuration below
a directory. Common generated directories such as `node_modules`, `dist`,
`build`, `.wrangler`, and `coverage` are skipped.

```sh
npx flarecheck . --all
npx flarecheck ./apps --all --github --strict
npx flarecheck . --all --json
```

Human output includes every Worker and an aggregate summary. JSON returns a
`projects` array, while GitHub output annotates each configuration file.

### Upload results to GitHub Code Scanning

FlareCheck can produce SARIF 2.1.0 for GitHub Code Scanning and compatible
analysis dashboards:

```yaml
permissions:
  contents: read
  security-events: write

steps:
  - uses: actions/checkout@v6
  - name: Generate FlareCheck SARIF
    run: npx flarecheck --sarif > flarecheck.sarif
    continue-on-error: true
  - name: Upload FlareCheck results
    uses: github/codeql-action/upload-sarif@v4
    with:
      sarif_file: flarecheck.sarif
```

Use `--all --sarif` to combine every Worker in a monorepo into one standards-based
report. FlareCheck includes rule metadata, severity, file locations, fixes, and
stable fingerprints.

## Checks

| Rule | Check |
| --- | --- |
| `FC001` | Compatibility date exists, is valid, and is not stale |
| `FC002` | `nodejs_compat` is enabled |
| `FC003` | Likely secrets are not committed in `vars` |
| `FC004` | Workers observability and sampling are intentional |
| `FC005` | Every environment declares its non-inherited bindings |
| `FC006` | Deployment scripts select a configured environment |
| `FC007` | Wrangler uses Cloudflare's recommended JSONC format |
| `FC008` | Non-production environments do not share stateful production resources |

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
