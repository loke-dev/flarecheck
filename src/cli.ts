#!/usr/bin/env node

import { analyze, analyzeAll, VERSION } from './analyze.js'
import { ConfigError } from './config.js'
import { CliArgumentError, parseArgs, wantsJson } from './options.js'
import {
  formatGitHub,
  formatGitHubMany,
  formatHuman,
  formatHumanMany,
  formatSarif,
} from './report.js'
import { RULES } from './rules.js'
import { terminalText } from './text.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(help())
    return
  }
  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${VERSION}\n`)
    return
  }

  try {
    const options = parseArgs(args)
    if (options.listRules) {
      process.stdout.write(
        options.format === 'json'
          ? `${JSON.stringify(RULES.map(({ id, title }) => ({ id, title })), null, 2)}\n`
          : `${RULES.map((rule) => `${rule.id}  ${rule.title}`).join('\n')}\n`,
      )
      return
    }

    const analyzeOptions = { only: options.only, ignore: options.ignore }
    if (options.all) {
      const result = await analyzeAll(options.inputPath, analyzeOptions)
      const output =
        options.format === 'json'
          ? `${JSON.stringify(result, null, 2)}\n`
          : options.format === 'sarif'
            ? formatSarif(result)
          : options.format === 'github'
            ? formatGitHubMany(result)
            : formatHumanMany(result, options.color)
      process.stdout.write(output)
      setExitCode(result.summary, options.strict)
      return
    }

    const result = await analyze(options.inputPath, analyzeOptions)
    const output =
      options.format === 'json'
        ? `${JSON.stringify(result, null, 2)}\n`
        : options.format === 'sarif'
          ? formatSarif(result)
        : options.format === 'github'
          ? formatGitHub(result)
          : formatHuman(result, options.color)
    process.stdout.write(output)
    setExitCode(result.summary, options.strict)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (wantsJson(args)) {
      process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`)
    } else {
      process.stderr.write(`FlareCheck: ${terminalText(message)}\n`)
    }
    process.exitCode = error instanceof ConfigError || error instanceof CliArgumentError ? 1 : 2
  }
}

function setExitCode(
  summary: { errors: number; warnings: number },
  strict: boolean,
): void {
  if (summary.errors > 0) process.exitCode = 2
  else if (strict && summary.warnings > 0) process.exitCode = 1
}

function help(): string {
  return `FlareCheck v${VERSION}

Production-readiness checks for Cloudflare Workers projects.

Usage:
  flarecheck [path] [options]

Options:
  --format <human|json|github|sarif>
               Select terminal, JSON, GitHub Actions, or SARIF output
  --json       Alias for --format json
  --github     Alias for --format github
  --sarif      Alias for --format sarif
  --list-rules List every available rule and exit
  --all        Recursively scan every Worker below the path
  --only <ids> Run only comma-separated rule IDs
  --ignore <ids>
               Skip comma-separated rule IDs
  --strict     Exit with code 1 when warnings are found
  --no-color   Disable ANSI colors
  -v, --version
  -h, --help

Exit codes:
  0  No errors (and no warnings with --strict)
  1  Invalid configuration, or warnings with --strict
  2  Production-readiness errors
`
}

await main()
