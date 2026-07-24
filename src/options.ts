import { resolve } from 'node:path'

export type OutputFormat = 'human' | 'json' | 'github'

export interface CliOptions {
  inputPath: string
  format: OutputFormat
  strict: boolean
  color: boolean
}

export function parseArgs(args: string[], noColor = Boolean(process.env.NO_COLOR)): CliOptions {
  let format: OutputFormat = 'human'
  let inputPath = '.'
  let hasInputPath = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--json') format = 'json'
    else if (arg === '--github') format = 'github'
    else if (arg === '--format') {
      const value = args[index + 1]
      if (!value) throw new CliArgumentError('--format requires human, json, or github.')
      format = parseFormat(value)
      index += 1
    } else if (arg?.startsWith('--format=')) {
      format = parseFormat(arg.slice('--format='.length))
    } else if (arg === '--strict' || arg === '--no-color') {
      continue
    } else if (arg?.startsWith('-')) {
      throw new CliArgumentError(`Unknown option "${arg}".`)
    } else if (arg) {
      if (hasInputPath) throw new CliArgumentError('Only one project path can be scanned at a time.')
      inputPath = arg
      hasInputPath = true
    }
  }

  return {
    inputPath: resolve(inputPath),
    format,
    strict: args.includes('--strict'),
    color: !args.includes('--no-color') && !noColor,
  }
}

export function wantsJson(args: string[]): boolean {
  return args.includes('--json') || args.includes('--format=json')
}

export class CliArgumentError extends Error {}

function parseFormat(value: string): OutputFormat {
  if (value === 'human' || value === 'json' || value === 'github') return value
  throw new CliArgumentError(`Unknown output format "${value}". Use human, json, or github.`)
}
