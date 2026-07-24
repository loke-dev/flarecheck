import { findConfigPaths, loadConfig, loadPackageScripts } from './config.js'
import { runChecks } from './rules.js'
import type { Finding, MultiScanResult, ScanResult, Severity } from './types.js'

export const VERSION = '0.9.0'

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
  const { config, configPath, projectRoot, lineFor } = await loadConfig(inputPath)
  const packageScripts = await loadPackageScripts(projectRoot)
  const checks = runChecks(
    {
      config,
      configPath,
      scripts: packageScripts.scripts,
      scriptsPath: packageScripts.packagePath,
      lineForScript: packageScripts.lineForScript,
      lineFor,
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

export async function analyzeAll(
  inputPath: string,
  options: {
    now?: Date | undefined
    only?: string[] | undefined
    ignore?: string[] | undefined
  } = {},
): Promise<MultiScanResult> {
  const configPaths = await findConfigPaths(inputPath)
  const projects = await Promise.all(configPaths.map((configPath) => analyze(configPath, options)))
  const totalScore = projects.reduce((total, project) => total + project.score, 0)

  return {
    version: VERSION,
    root: inputPath,
    projects,
    summary: {
      projects: projects.length,
      averageScore: Math.round(totalScore / projects.length),
      errors: sumSummary(projects, 'errors'),
      warnings: sumSummary(projects, 'warnings'),
      info: sumSummary(projects, 'info'),
      passed: sumSummary(projects, 'passed'),
    },
  }
}

function countSeverity(findings: Finding[], severity: Severity): number {
  return findings.filter((finding) => finding.severity === severity).length
}

function sumSummary(
  projects: ScanResult[],
  key: keyof ScanResult['summary'],
): number {
  return projects.reduce((total, project) => total + project.summary[key], 0)
}
