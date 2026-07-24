import { loadConfig, loadPackageScripts } from './config.js'
import { runChecks } from './rules.js'
import type { Finding, ScanResult, Severity } from './types.js'

export const VERSION = '0.4.0'

const PENALTIES: Record<Severity, number> = {
  error: 20,
  warning: 8,
  info: 0,
}

export async function analyze(
  inputPath: string,
  options: {
    now?: Date | undefined
    only?: string[] | undefined
    ignore?: string[] | undefined
  } = {},
): Promise<ScanResult> {
  const { config, configPath, projectRoot } = await loadConfig(inputPath)
  const scripts = await loadPackageScripts(projectRoot)
  const checks = runChecks(
    {
      config,
      configPath,
      scripts,
      now: options.now ?? new Date(),
    },
    { only: options.only, ignore: options.ignore },
  )

  const findings = checks.flatMap((check) => check.findings)
  const passed = checks
    .filter((check) => check.findings.length === 0)
    .map(({ ruleId, title }) => ({ ruleId, title }))
  const summary = {
    errors: countSeverity(findings, 'error'),
    warnings: countSeverity(findings, 'warning'),
    info: countSeverity(findings, 'info'),
    passed: passed.length,
  }
  const score = Math.max(
    0,
    100 - findings.reduce((total, finding) => total + PENALTIES[finding.severity], 0),
  )

  return { version: VERSION, configPath, score, findings, passed, summary }
}

function countSeverity(findings: Finding[], severity: Severity): number {
  return findings.filter((finding) => finding.severity === severity).length
}
