import { basename } from 'node:path'
import { asRecord, isRecord } from './config.js'
import type { CheckResult, Finding, WorkerConfig } from './types.js'

const DOCS = {
  bestPractices:
    'https://developers.cloudflare.com/workers/best-practices/workers-best-practices/',
  compatibility: 'https://developers.cloudflare.com/workers/wrangler/configuration/#inheritable-keys',
  environments: 'https://developers.cloudflare.com/workers/wrangler/environments/',
  observability: 'https://developers.cloudflare.com/workers/observability/logs/workers-logs/',
  secrets: 'https://developers.cloudflare.com/workers/configuration/secrets/',
}

const BINDING_KEYS = [
  'agent_memory',
  'ai',
  'ai_search',
  'ai_search_namespaces',
  'analytics_engine_datasets',
  'artifacts',
  'browser',
  'd1_databases',
  'dispatch_namespaces',
  'durable_objects',
  'flagship',
  'hyperdrive',
  'images',
  'kv_namespaces',
  'media',
  'mtls_certificates',
  'pipelines',
  'queues',
  'r2_buckets',
  'ratelimits',
  'secrets',
  'secrets_store_secrets',
  'send_email',
  'services',
  'stream',
  'streaming_tail_consumers',
  'tail_consumers',
  'unsafe',
  'vectorize',
  'vars',
  'vpc_networks',
  'vpc_services',
  'websearch',
  'worker_loaders',
  'workflows',
] as const

const SECRET_NAME_PATTERN =
  /(^|[_-])(api[_-]?)?(key|secret|token|password|passwd|private[_-]?key|client[_-]?secret|auth|jwt|session[_-]?secret|access[_-]?(token|key))(?:[_-]|$)/i
const PLACEHOLDER_PATTERN = /^(example|placeholder|replace|changeme|development|local|test|<.+>)$/i

export interface RuleContext {
  config: WorkerConfig
  configPath: string
  scripts: Record<string, string>
  scriptsPath: string
  lineFor: (path: Array<string | number>) => number | undefined
  lineForScript: (name: string) => number | undefined
  now: Date
}

export interface RuleDefinition {
  id: string
  title: string
  helpUri: string
  check: (context: RuleContext) => CheckResult
}

export interface RuleSelection {
  only?: string[] | undefined
  ignore?: string[] | undefined
}

const RULE_TITLES = {
  FC001: 'Compatibility date is current',
  FC002: 'Node.js compatibility is enabled',
  FC003: 'No likely secrets are committed in vars',
  FC004: 'Production observability is configured',
  FC005: 'Every environment declares its bindings',
  FC006: 'Deploy commands select an environment',
  FC007: 'Wrangler uses the recommended JSONC format',
  FC008: 'Production resources are isolated by environment',
  FC009: 'Environment routing targets are explicit',
} as const

export const RULES: RuleDefinition[] = [
  {
    id: 'FC001',
    title: RULE_TITLES.FC001,
    helpUri: DOCS.compatibility,
    check: checkCompatibilityDate,
  },
  {
    id: 'FC002',
    title: RULE_TITLES.FC002,
    helpUri: DOCS.bestPractices,
    check: checkNodeCompatibility,
  },
  { id: 'FC003', title: RULE_TITLES.FC003, helpUri: DOCS.secrets, check: checkSecretsInVars },
  {
    id: 'FC004',
    title: RULE_TITLES.FC004,
    helpUri: DOCS.observability,
    check: checkObservability,
  },
  {
    id: 'FC005',
    title: RULE_TITLES.FC005,
    helpUri: DOCS.environments,
    check: checkEnvironmentBindings,
  },
  {
    id: 'FC006',
    title: RULE_TITLES.FC006,
    helpUri: DOCS.environments,
    check: checkDeployCommand,
  },
  {
    id: 'FC007',
    title: RULE_TITLES.FC007,
    helpUri: DOCS.bestPractices,
    check: checkConfigFormat,
  },
  {
    id: 'FC008',
    title: RULE_TITLES.FC008,
    helpUri: DOCS.environments,
    check: checkSharedEnvironmentResources,
  },
  {
    id: 'FC009',
    title: RULE_TITLES.FC009,
    helpUri: DOCS.environments,
    check: checkEnvironmentRouting,
  },
]

export function runChecks(context: RuleContext, selection: RuleSelection = {}): CheckResult[] {
  const only = selection.only ? new Set(selection.only) : undefined
  const ignored = new Set(selection.ignore ?? [])

  return RULES.filter((rule) => (!only || only.has(rule.id)) && !ignored.has(rule.id)).map(
    (rule) => rule.check(context),
  )
}

function checkCompatibilityDate({ config, configPath, lineFor, now }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC001
  const value = config.compatibility_date
  if (typeof value !== 'string') {
    return result('FC001', title, [
      finding('FC001', 'error', 'Missing compatibility date', 'Set compatibility_date explicitly.', configPath, {
        docs: DOCS.compatibility,
        line: 1,
        suggestion: `Set "compatibility_date" to "${toDateString(now)}".`,
      }),
    ])
  }

  const parsed = parseCompatibilityDate(value)
  if (!parsed) {
    return result('FC001', title, [
      finding('FC001', 'error', 'Invalid compatibility date', `"${value}" is not a valid date.`, configPath, {
        docs: DOCS.compatibility,
        line: lineFor(['compatibility_date']),
        suggestion: `Use a real calendar date in YYYY-MM-DD format, for example "${toDateString(now)}".`,
      }),
    ])
  }

  const ageDays = Math.floor((startOfUtcDay(now).valueOf() - parsed.valueOf()) / 86_400_000)
  if (ageDays > 90) {
    return result('FC001', title, [
      finding(
        'FC001',
        'warning',
        'Compatibility date is stale',
        `${value} is ${ageDays} days old, so this Worker may miss runtime fixes and APIs.`,
        configPath,
        {
          docs: DOCS.compatibility,
          line: lineFor(['compatibility_date']),
          suggestion: 'Update the date deliberately and run the project test suite.',
        },
      ),
    ])
  }

  return result('FC001', title)
}

function checkNodeCompatibility({ config, configPath, lineFor }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC002
  const flags = Array.isArray(config.compatibility_flags) ? config.compatibility_flags : []
  if (!flags.includes('nodejs_compat')) {
    return result('FC002', title, [
      finding(
        'FC002',
        'warning',
        'Node.js compatibility is disabled',
        'Many packages rely on Node.js built-ins and can fail only after deployment.',
        configPath,
        {
          docs: DOCS.bestPractices,
          line: lineFor(['compatibility_flags']) ?? 1,
          suggestion: 'Add "nodejs_compat" to compatibility_flags.',
        },
      ),
    ])
  }
  return result('FC002', title)
}

function checkSecretsInVars({ config, configPath, lineFor }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC003
  const findings: Finding[] = []
  inspectVars(config.vars, ['vars'], configPath, lineFor, findings)

  const environments = asRecord(config.env)
  if (environments) {
    for (const [environmentName, environmentConfig] of Object.entries(environments)) {
      const environment = asRecord(environmentConfig)
      inspectVars(
        environment?.vars,
        ['env', environmentName, 'vars'],
        configPath,
        lineFor,
        findings,
      )
    }
  }

  return result('FC003', title, findings)
}

function inspectVars(
  value: unknown,
  path: string[],
  configPath: string,
  lineFor: RuleContext['lineFor'],
  findings: Finding[],
): void {
  const vars = asRecord(value)
  if (!vars) return

  for (const [name, variable] of Object.entries(vars)) {
    if (
      SECRET_NAME_PATTERN.test(name) &&
      typeof variable === 'string' &&
      variable.length > 0 &&
      !PLACEHOLDER_PATTERN.test(variable)
    ) {
      findings.push(
        finding(
          'FC003',
          'error',
          `Likely secret committed as ${name}`,
          `${[...path, name].join('.')} looks sensitive and will be stored in source control.`,
          configPath,
          {
            docs: DOCS.secrets,
            line: lineFor([...path, name]),
            suggestion: `Remove ${name} from vars and store it with "wrangler secret put ${name}".`,
          },
        ),
      )
    }
  }
}

function checkObservability({ config, configPath, lineFor }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC004
  const observability = asRecord(config.observability)
  if (!observability || observability.enabled !== true) {
    return result('FC004', title, [
      finding(
        'FC004',
        'warning',
        'Workers observability is not enabled',
        'Production exceptions and request logs may be unavailable when an incident occurs.',
        configPath,
        {
          docs: DOCS.observability,
          line:
            lineFor(['observability', 'enabled']) ??
            lineFor(['observability']) ??
            1,
          suggestion: 'Enable observability and choose an intentional head_sampling_rate.',
        },
      ),
    ])
  }

  const samplingRate = observability.head_sampling_rate
  if (samplingRate === 1) {
    return result('FC004', title, [
      finding(
        'FC004',
        'warning',
        'Observability samples every request',
        'A 100% sampling rate can produce unnecessary log volume on a busy Worker.',
        configPath,
        {
          docs: DOCS.observability,
          line: lineFor(['observability', 'head_sampling_rate']),
          suggestion: 'Choose a lower rate intentionally, such as 0.1, after considering traffic.',
        },
      ),
    ])
  }

  return result('FC004', title)
}

function checkEnvironmentBindings({ config, configPath, lineFor }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC005
  const environments = asRecord(config.env)
  if (!environments || Object.keys(environments).length === 0) return result('FC005', title)

  const rootBindings = BINDING_KEYS.filter((key) => config[key] !== undefined)
  const findings: Finding[] = []

  for (const [environmentName, environmentValue] of Object.entries(environments)) {
    const environment = asRecord(environmentValue)
    if (!environment) continue

    const missing = rootBindings.filter((key) => environment[key] === undefined)
    if (missing.length > 0) {
      findings.push(
        finding(
          'FC005',
          'warning',
          `${environmentName} is missing non-inherited bindings`,
          `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} defined at the root but not in env.${environmentName}.`,
          configPath,
          {
            docs: DOCS.environments,
            line: lineFor(['env', environmentName]),
            suggestion: `Declare the intended ${missing.join(', ')} values inside env.${environmentName}.`,
          },
        ),
      )
    }
  }

  return result('FC005', title, findings)
}

function checkDeployCommand({
  config,
  scripts,
  scriptsPath,
  lineForScript,
}: RuleContext): CheckResult {
  const title = RULE_TITLES.FC006
  const environments = asRecord(config.env)
  if (!environments || Object.keys(environments).length === 0) return result('FC006', title)

  const findings: Finding[] = []
  for (const [name, command] of Object.entries(scripts)) {
    if (
      /(^|\s)(wrangler|pnpm\s+wrangler|npx\s+wrangler)\s+deploy(\s|$)/.test(command) &&
      !/(--env|-e)(=|\s)/.test(command)
    ) {
      findings.push(
        finding(
          'FC006',
          'warning',
          `Script "${name}" can deploy the root Worker`,
          `"${command}" does not select one of the configured environments.`,
          scriptsPath,
          {
            docs: DOCS.environments,
            line: lineForScript(name),
            suggestion: 'Add "--env production" or the intended environment explicitly.',
          },
        ),
      )
    }
  }

  return result('FC006', title, findings)
}

function checkConfigFormat({ configPath }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC007
  if (basename(configPath) === 'wrangler.toml') {
    return result('FC007', title, [
      finding(
        'FC007',
        'info',
        'Wrangler configuration uses TOML',
        'Cloudflare recommends JSONC for new projects, and newer features may be JSON-only.',
        configPath,
        {
          docs: DOCS.bestPractices,
          line: 1,
          suggestion: 'Consider migrating to wrangler.jsonc when it is convenient.',
        },
      ),
    ])
  }
  return result('FC007', title)
}

interface ResourceType {
  configKey: string
  identityKey: string
  label: string
}

const STATEFUL_RESOURCES: ResourceType[] = [
  { configKey: 'd1_databases', identityKey: 'database_id', label: 'D1 database' },
  { configKey: 'kv_namespaces', identityKey: 'id', label: 'KV namespace' },
  { configKey: 'r2_buckets', identityKey: 'bucket_name', label: 'R2 bucket' },
  { configKey: 'hyperdrive', identityKey: 'id', label: 'Hyperdrive configuration' },
  { configKey: 'vectorize', identityKey: 'index_name', label: 'Vectorize index' },
]

function checkSharedEnvironmentResources({ config, configPath, lineFor }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC008
  const environments = asRecord(config.env)
  const production = asRecord(environments?.production)
  if (!environments || !production) return result('FC008', title)

  const findings: Finding[] = []
  for (const [environmentName, environmentValue] of Object.entries(environments)) {
    if (environmentName === 'production') continue
    const environment = asRecord(environmentValue)
    if (!environment) continue

    for (const resource of STATEFUL_RESOURCES) {
      const productionTargets = resourceTargets(production[resource.configKey], resource)
      const environmentTargets = resourceTargets(environment[resource.configKey], resource)

      for (const [binding, target] of environmentTargets) {
        if (productionTargets.get(binding)?.identity !== target.identity) continue
        findings.push(
          finding(
            'FC008',
            'warning',
            `${environmentName} shares a production ${resource.label}`,
            `env.${environmentName}.${resource.configKey} binding "${binding}" points to the same resource as env.production.`,
            configPath,
            {
              docs: DOCS.environments,
              line: lineFor([
                'env',
                environmentName,
                resource.configKey,
                target.index,
                resource.identityKey,
              ]),
              suggestion: `Give env.${environmentName} a separate ${resource.label} and update its ${resource.identityKey}.`,
            },
          ),
        )
      }
    }
  }

  return result('FC008', title, findings)
}

function checkEnvironmentRouting({ config, configPath, lineFor }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC009
  const environments = asRecord(config.env)
  const rootHasRoute = config.route !== undefined || config.routes !== undefined
  if (!environments || !rootHasRoute) return result('FC009', title)

  const findings: Finding[] = []
  for (const [environmentName, environmentValue] of Object.entries(environments)) {
    const environment = asRecord(environmentValue)
    if (
      !environment ||
      environment.route !== undefined ||
      environment.routes !== undefined ||
      environment.workers_dev !== undefined
    ) {
      continue
    }

    findings.push(
      finding(
        'FC009',
        'warning',
        `${environmentName} has no explicit route target`,
        `The root Worker has a route, but env.${environmentName} does not declare route, routes, or workers_dev.`,
        configPath,
        {
          docs: DOCS.environments,
          line: lineFor(['env', environmentName]),
          suggestion: `Set the intended route, routes, or workers_dev value inside env.${environmentName}.`,
        },
      ),
    )
  }

  return result('FC009', title, findings)
}

function resourceTargets(
  value: unknown,
  type: ResourceType,
): Map<string, { identity: string; index: number }> {
  if (!Array.isArray(value)) return new Map()

  const targets = new Map<string, { identity: string; index: number }>()
  for (const [index, item] of value.entries()) {
    const resource = asRecord(item)
    const binding = resource?.binding
    const identity = resource?.[type.identityKey]
    if (typeof binding === 'string' && typeof identity === 'string') {
      targets.set(binding, { identity, index })
    }
  }
  return targets
}

function result(ruleId: string, title: string, findings: Finding[] = []): CheckResult {
  return { ruleId, title, findings }
}

function finding(
  ruleId: string,
  severity: Finding['severity'],
  title: string,
  message: string,
  path: string,
  optional: Pick<Finding, 'docs' | 'line' | 'suggestion'> = {},
): Finding {
  return { ruleId, severity, title, message, path, ...optional }
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseCompatibilityDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && toDateString(parsed) === value ? parsed : undefined
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function isWorkerConfig(value: unknown): value is WorkerConfig {
  return isRecord(value)
}
