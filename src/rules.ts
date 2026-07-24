import { basename } from 'node:path'
import { asRecord, isRecord } from './config.js'
import type { CheckResult, Finding, WorkerConfig } from './types.js'

const DOCS = {
  bestPractices:
    'https://developers.cloudflare.com/workers/best-practices/workers-best-practices/',
  compatibility: 'https://developers.cloudflare.com/workers/configuration/compatibility-dates/',
  environments: 'https://developers.cloudflare.com/workers/wrangler/environments/',
  observability: 'https://developers.cloudflare.com/workers/observability/logs/workers-logs/',
  secrets: 'https://developers.cloudflare.com/workers/configuration/secrets/',
}

const BINDING_KEYS = [
  'ai',
  'analytics_engine_datasets',
  'browser',
  'd1_databases',
  'dispatch_namespaces',
  'durable_objects',
  'hyperdrive',
  'images',
  'kv_namespaces',
  'mtls_certificates',
  'queues',
  'r2_buckets',
  'services',
  'vectorize',
  'vars',
  'version_metadata',
  'workflows',
] as const

const SECRET_NAME_PATTERN =
  /(^|_)(api_?)?(key|secret|token|password|passwd|private_?key|client_?secret|auth)(_|$)/i
const PLACEHOLDER_PATTERN = /^(example|placeholder|replace|changeme|development|local|test|<.+>)$/i

export interface RuleContext {
  config: WorkerConfig
  configPath: string
  scripts: Record<string, string>
  now: Date
}

export interface RuleDefinition {
  id: string
  title: string
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
} as const

export const RULES: RuleDefinition[] = [
  { id: 'FC001', title: RULE_TITLES.FC001, check: checkCompatibilityDate },
  { id: 'FC002', title: RULE_TITLES.FC002, check: checkNodeCompatibility },
  { id: 'FC003', title: RULE_TITLES.FC003, check: checkSecretsInVars },
  { id: 'FC004', title: RULE_TITLES.FC004, check: checkObservability },
  { id: 'FC005', title: RULE_TITLES.FC005, check: checkEnvironmentBindings },
  { id: 'FC006', title: RULE_TITLES.FC006, check: checkDeployCommand },
  { id: 'FC007', title: RULE_TITLES.FC007, check: checkConfigFormat },
  { id: 'FC008', title: RULE_TITLES.FC008, check: checkSharedEnvironmentResources },
]

export function runChecks(context: RuleContext, selection: RuleSelection = {}): CheckResult[] {
  const only = selection.only ? new Set(selection.only) : undefined
  const ignored = new Set(selection.ignore ?? [])

  return RULES.filter((rule) => (!only || only.has(rule.id)) && !ignored.has(rule.id)).map(
    (rule) => rule.check(context),
  )
}

function checkCompatibilityDate({ config, configPath, now }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC001
  const value = config.compatibility_date
  if (typeof value !== 'string') {
    return result('FC001', title, [
      finding('FC001', 'error', 'Missing compatibility date', 'Set compatibility_date explicitly.', configPath, {
        docs: DOCS.compatibility,
        suggestion: `Set "compatibility_date" to "${toDateString(now)}".`,
      }),
    ])
  }

  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) {
    return result('FC001', title, [
      finding('FC001', 'error', 'Invalid compatibility date', `"${value}" is not a valid date.`, configPath, {
        docs: DOCS.compatibility,
        suggestion: `Use the YYYY-MM-DD format, for example "${toDateString(now)}".`,
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
          suggestion: 'Update the date deliberately and run the project test suite.',
        },
      ),
    ])
  }

  return result('FC001', title)
}

function checkNodeCompatibility({ config, configPath }: RuleContext): CheckResult {
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
          suggestion: 'Add "nodejs_compat" to compatibility_flags.',
        },
      ),
    ])
  }
  return result('FC002', title)
}

function checkSecretsInVars({ config, configPath }: RuleContext): CheckResult {
  const title = RULE_TITLES.FC003
  const findings: Finding[] = []
  inspectVars(config.vars, 'vars', configPath, findings)

  const environments = asRecord(config.env)
  if (environments) {
    for (const [environmentName, environmentConfig] of Object.entries(environments)) {
      const environment = asRecord(environmentConfig)
      inspectVars(environment?.vars, `env.${environmentName}.vars`, configPath, findings)
    }
  }

  return result('FC003', title, findings)
}

function inspectVars(
  value: unknown,
  path: string,
  configPath: string,
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
          `${path}.${name} looks sensitive and will be stored in source control.`,
          configPath,
          {
            docs: DOCS.secrets,
            suggestion: `Remove ${name} from vars and store it with "wrangler secret put ${name}".`,
          },
        ),
      )
    }
  }
}

function checkObservability({ config, configPath }: RuleContext): CheckResult {
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
          suggestion: 'Choose a lower rate intentionally, such as 0.1, after considering traffic.',
        },
      ),
    ])
  }

  return result('FC004', title)
}

function checkEnvironmentBindings({ config, configPath }: RuleContext): CheckResult {
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
            suggestion: `Declare the intended ${missing.join(', ')} values inside env.${environmentName}.`,
          },
        ),
      )
    }
  }

  return result('FC005', title, findings)
}

function checkDeployCommand({ config, configPath, scripts }: RuleContext): CheckResult {
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
          configPath,
          {
            docs: DOCS.environments,
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

function checkSharedEnvironmentResources({ config, configPath }: RuleContext): CheckResult {
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
        if (productionTargets.get(binding) !== target) continue
        findings.push(
          finding(
            'FC008',
            'warning',
            `${environmentName} shares a production ${resource.label}`,
            `env.${environmentName}.${resource.configKey} binding "${binding}" points to the same resource as env.production.`,
            configPath,
            {
              docs: DOCS.environments,
              suggestion: `Give env.${environmentName} a separate ${resource.label} and update its ${resource.identityKey}.`,
            },
          ),
        )
      }
    }
  }

  return result('FC008', title, findings)
}

function resourceTargets(value: unknown, type: ResourceType): Map<string, string> {
  if (!Array.isArray(value)) return new Map()

  const targets = new Map<string, string>()
  for (const item of value) {
    const resource = asRecord(item)
    const binding = resource?.binding
    const identity = resource?.[type.identityKey]
    if (typeof binding === 'string' && typeof identity === 'string') {
      targets.set(binding, identity)
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
  optional: Pick<Finding, 'docs' | 'suggestion'> = {},
): Finding {
  return { ruleId, severity, title, message, path, ...optional }
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function isWorkerConfig(value: unknown): value is WorkerConfig {
  return isRecord(value)
}
