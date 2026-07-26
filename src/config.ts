import { readFile, readdir } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { resolve, basename, dirname, join } from 'node:path'
import {
  parse as parseJsonc,
  printParseErrorCode,
  visit,
  type JSONPath,
  type ParseError,
} from 'jsonc-parser'
import { parse as parseToml } from 'smol-toml'
import type { WorkerConfig } from './types.js'

const CONFIG_NAMES = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'] as const
const IGNORED_DIRECTORIES = new Set([
  '.astro',
  '.git',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.vercel',
  '.wrangler',
  'build',
  'coverage',
  'dist',
  'node_modules',
])

export class ConfigError extends Error {}

export async function loadConfig(inputPath: string): Promise<{
  config: WorkerConfig
  configPath: string
  projectRoot: string
  lineFor: (path: JSONPath) => number | undefined
}> {
  const absolute = resolve(inputPath)
  const input = statSync(absolute, { throwIfNoEntry: false })
  if (!input) throw new ConfigError(`Path does not exist: ${absolute}`)
  const inputIsDirectory = input.isDirectory()
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

  const lineFor = configPath.endsWith('.toml')
    ? createTomlLineResolver(source)
    : createJsonLineResolver(source)
  return { config: parsed, configPath, projectRoot: dirname(configPath), lineFor }
}

function findConfigInDirectory(directory: string): string | undefined {
  for (const name of CONFIG_NAMES) {
    const candidate = join(directory, name)
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate
  }
  return undefined
}

export async function findConfigPaths(inputPath: string): Promise<string[]> {
  const absolute = resolve(inputPath)
  const input = statSync(absolute, { throwIfNoEntry: false })
  if (!input) throw new ConfigError(`Path does not exist: ${absolute}`)
  if (!input.isDirectory()) return [absolute]

  const configPaths: string[] = []
  await findConfigsRecursively(absolute, configPaths)
  if (configPaths.length === 0) {
    throw new ConfigError(
      `No Wrangler configuration found below ${absolute}. Expected ${CONFIG_NAMES.join(', ')}.`,
    )
  }
  return configPaths
}

async function findConfigsRecursively(directory: string, configPaths: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name))
  const configName = CONFIG_NAMES.find((name) => names.has(name))
  if (configName) configPaths.push(join(directory, configName))

  const childDirectories = entries
    .filter((entry) => entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
  for (const child of childDirectories) {
    await findConfigsRecursively(join(directory, child.name), configPaths)
  }
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

export async function loadPackageScripts(projectRoot: string): Promise<{
  scripts: Record<string, string>
  packagePath: string
  lineForScript: (name: string) => number | undefined
}> {
  const packagePath = join(projectRoot, 'package.json')
  const empty = { scripts: {}, packagePath, lineForScript: () => undefined }
  if (!statSync(packagePath, { throwIfNoEntry: false })?.isFile()) return empty

  try {
    const source = await readFile(packagePath, 'utf8')
    const packageJson: unknown = JSON.parse(source)
    const scripts = isRecord(packageJson) ? asRecord(packageJson.scripts) : undefined
    if (!scripts) return empty
    const lines = createJsonLineResolver(source)
    return {
      scripts: Object.fromEntries(
        Object.entries(scripts).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
      packagePath,
      lineForScript: (name) => lines(['scripts', name]),
    }
  } catch {
    return empty
  }
}

function createJsonLineResolver(source: string): (path: JSONPath) => number | undefined {
  const lines = new Map<string, number>()
  visit(
    source,
    {
      onObjectProperty(property, _offset, _length, startLine, _startCharacter, pathSupplier) {
        lines.set(pathKey([...pathSupplier(), property]), startLine + 1)
      },
    },
    { allowTrailingComma: true },
  )
  return (path) => lines.get(pathKey(path))
}

function createTomlLineResolver(source: string): (path: JSONPath) => number | undefined {
  const sourceLines = source.split(/\r?\n/)
  return (path) => {
    const property = path.at(-1)
    if (typeof property !== 'string') return undefined
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const lineIndex = sourceLines.findIndex((line) => new RegExp(`^\\s*${escaped}\\s*=`).test(line))
    return lineIndex >= 0 ? lineIndex + 1 : undefined
  }
}

function pathKey(path: JSONPath): string {
  return JSON.stringify(path)
}
