export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  ruleId: string
  severity: Severity
  title: string
  message: string
  path: string
  line?: number | undefined
  docs?: string
  suggestion?: string
}

export interface CheckResult {
  ruleId: string
  title: string
  findings: Finding[]
}

export interface ScanResult {
  version: string
  configPath: string
  score: number
  findings: Finding[]
  passed: Array<Pick<CheckResult, 'ruleId' | 'title'>>
  summary: {
    errors: number
    warnings: number
    info: number
    passed: number
  }
}

export interface MultiScanResult {
  version: string
  root: string
  projects: ScanResult[]
  summary: {
    projects: number
    averageScore: number
    errors: number
    warnings: number
    info: number
    passed: number
  }
}

export type WorkerConfig = Record<string, unknown> & {
  compatibility_date?: string
  compatibility_flags?: unknown
  env?: unknown
  observability?: unknown
  vars?: unknown
}
