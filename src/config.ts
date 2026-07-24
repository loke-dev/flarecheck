import { readFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { resolve, basename, dirname, join } from 'node:path'
import { parse as parseJsonc, printParseErrorCode, type ParseError } from 'jsonc-parser'
import { parse as parseToml } from 'smol-toml'
import type { WorkerConfig } from './types.js'

const CONFIG_NAMES = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'] as const

export class ConfigError extends Error {}

export async function loadConfig(inputPath: string): Promise<{
  config: WorkerConfig
  configPath: string
  projectRoot: string
}> {
  const absolute = resolve(inputPath)
  const inputIsDirectory = statSync(absolute, { throwIfNoEntry: false })?.isDirectory() ?? false
  const configPath = inputIsDirectory ? findConfigInDirectory(absolute) : absolute

  if (!configPath) {
    throw new ConfigError(
      `No Wrangler configuration found in ${absolute}. Expected ${CONFIG_NAMES.join(', ')}.`,
    )
  }

  if (!CONFIG_NAMES.includes(basename(configPath) as (typeof CONFIG_NAMES)[number])) {
    throw new ConfigError(`Unsupported configuration file: ${configPath}`)
  }

  const source = await readFile(configPath, 'utf8')
  let parsed: unknown

  if (configPath.endsWith('.toml')) {
    try {
      parsed = parseToml(source)
    } catch (error) {
      throw new ConfigError(`Could not parse ${configPath}: ${errorMessage(error)}`)
    }
  } else {
    const errors: ParseError[] = []
    parsed = parseJsonc(source, errors, { allowTrailingComma: true })
    if (errors.length > 0) {
      const first = errors[0]
      throw new ConfigError(
        `Could not parse ${configPath}: ${first ? printParseErrorCode(first.error) : 'unknown error'}`,
      )
    }
  }

  if (!isRecord(parsed)) {
    throw new ConfigError(`Expected ${configPath} to contain a configuration object.`)
  }

  return { config: parsed, configPath, projectRoot: dirname(configPath) }
}

function findConfigInDirectory(directory: string): string | undefined {
  for (const name of CONFIG_NAMES) {
    const candidate = join(directory, name)
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate
  }
  return undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export async function loadPackageScripts(projectRoot: string): Promise<Record<string, string>> {
  const packagePath = join(projectRoot, 'package.json')
  if (!statSync(packagePath, { throwIfNoEntry: false })?.isFile()) return {}

  try {
    const packageJson: unknown = JSON.parse(await readFile(packagePath, 'utf8'))
    const scripts = isRecord(packageJson) ? asRecord(packageJson.scripts) : undefined
    if (!scripts) return {}
    return Object.fromEntries(
      Object.entries(scripts).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}
