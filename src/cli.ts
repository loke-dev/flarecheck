#!/usr/bin/env node

import { resolve } from 'node:path'
import { analyze, VERSION } from './analyze.js'
import { ConfigError } from './config.js'
import { formatHuman } from './report.js'

interface CliOptions {
  inputPath: string
  json: boolean
  strict: boolean
  color: boolean
}

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

  const options = parseArgs(args)
  try {
    const result = await analyze(options.inputPath)
    process.stdout.write(
      options.json ? `${JSON.stringify(result, null, 2)}\n` : formatHuman(result, options.color),
    )

    if (result.summary.errors > 0) process.exitCode = 2
    else if (options.strict && result.summary.warnings > 0) process.exitCode = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`)
    } else {
      process.stderr.write(`FlareCheck: ${message}\n`)
    }
    process.exitCode = error instanceof ConfigError ? 1 : 2
  }
}

function parseArgs(args: string[]): CliOptions {
  const positional = args.filter((arg) => !arg.startsWith('-'))
  return {
    inputPath: resolve(positional[0] ?? '.'),
    json: args.includes('--json'),
    strict: args.includes('--strict'),
    color: !args.includes('--no-color') && !process.env.NO_COLOR,
  }
}

function help(): string {
  return `FlareCheck v${VERSION}

Production-readiness checks for Cloudflare Workers projects.

Usage:
  flarecheck [path] [options]

Options:
  --json       Emit machine-readable JSON
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
