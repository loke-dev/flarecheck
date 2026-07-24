import pc from 'picocolors'
import { relative } from 'node:path'
import type { Finding, ScanResult } from './types.js'

export function formatHuman(result: ScanResult, color = true): string {
  const c = createColors(color)
  const lines = [
    '',
    `${c.bold('FlareCheck')} ${c.dim(`v${result.version}`)}`,
    c.dim(result.configPath),
    '',
    `Production readiness: ${formatScore(result.score, c)}`,
    '',
  ]

  if (result.findings.length === 0) {
    lines.push(c.green('✓ No production-readiness findings.'), '')
  } else {
    for (const finding of result.findings) {
      lines.push(...formatFinding(finding, c), '')
    }
  }

  lines.push(
    c.dim(
      `${result.summary.errors} errors · ${result.summary.warnings} warnings · ${result.summary.info} info · ${result.summary.passed} checks passed`,
    ),
    '',
  )

  return lines.join('\n')
}

export function formatGitHub(result: ScanResult, cwd = process.cwd()): string {
  if (result.findings.length === 0) {
    const file = annotationPath(result.configPath, cwd)
    return `::notice file=${escapeProperty(file)},title=FlareCheck ${result.score}/100::No production-readiness findings.\n`
  }

  return `${result.findings
    .map((finding) => {
      const command =
        finding.severity === 'error'
          ? 'error'
          : finding.severity === 'warning'
            ? 'warning'
            : 'notice'
      const file = annotationPath(finding.path, cwd)
      const title = `${finding.ruleId}: ${finding.title}`
      const details = [
        finding.message,
        finding.suggestion ? `Fix: ${finding.suggestion}` : undefined,
        finding.docs,
      ]
        .filter(Boolean)
        .join('\n')

      return `::${command} file=${escapeProperty(file)},title=${escapeProperty(title)}::${escapeData(details)}`
    })
    .join('\n')}\n`
}

function formatFinding(finding: Finding, c: Colors): string[] {
  const icon =
    finding.severity === 'error'
      ? c.red('✗ ERROR')
      : finding.severity === 'warning'
        ? c.yellow('! WARNING')
        : c.cyan('i INFO')
  const lines = [
    `${icon} ${c.dim(finding.ruleId)}  ${c.bold(finding.title)}`,
    `  ${finding.message}`,
  ]
  if (finding.suggestion) lines.push(`  ${c.green('Fix:')} ${finding.suggestion}`)
  if (finding.docs) lines.push(`  ${c.dim(finding.docs)}`)
  return lines
}

function formatScore(score: number, c: Colors): string {
  const value = `${score}/100`
  if (score >= 90) return c.green(value)
  if (score >= 70) return c.yellow(value)
  return c.red(value)
}

function annotationPath(path: string, cwd: string): string {
  const relativePath = relative(cwd, path)
  return relativePath && !relativePath.startsWith('..') ? relativePath : path
}

function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C')
}

interface Colors {
  bold: (value: string) => string
  dim: (value: string) => string
  red: (value: string) => string
  yellow: (value: string) => string
  green: (value: string) => string
  cyan: (value: string) => string
}

function createColors(enabled: boolean): Colors {
  if (enabled) return pc
  const identity = (value: string): string => value
  return {
    bold: identity,
    dim: identity,
    red: identity,
    yellow: identity,
    green: identity,
    cyan: identity,
  }
}
