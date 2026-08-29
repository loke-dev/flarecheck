import pc from 'picocolors'
import { createHash } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RULES } from './rules.js'
import { terminalText } from './text.js'
import type { Finding, MultiScanResult, ScanResult } from './types.js'

export function formatHuman(result: ScanResult, color = true): string {
  const c = createColors(color)
  const lines = [
    '',
    `${c.bold('FlareCheck')} ${c.dim(`v${result.version}`)}`,
    c.dim(terminalText(result.configPath)),
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

      const line = finding.line ? `,line=${finding.line}` : ''
      return `::${command} file=${escapeProperty(file)}${line},title=${escapeProperty(title)}::${escapeData(details)}`
    })
    .join('\n')}\n`
}

export function formatHumanMany(result: MultiScanResult, color = true): string {
  const c = createColors(color)
  const projects = result.projects.map((project) => formatHuman(project, color)).join('')
  const summary = [
    c.bold(`Scanned ${result.summary.projects} Workers`),
    `Average readiness: ${formatScore(result.summary.averageScore, c)}`,
    c.dim(
      `${result.summary.errors} errors · ${result.summary.warnings} warnings · ${result.summary.info} info · ${result.summary.passed} checks passed`,
    ),
    '',
  ].join('\n')
  return `${projects}\n${summary}`
}

export function formatGitHubMany(result: MultiScanResult, cwd = process.cwd()): string {
  return result.projects.map((project) => formatGitHub(project, cwd)).join('')
}

export function formatSarif(
  input: ScanResult | MultiScanResult,
  cwd = process.cwd(),
): string {
  const projects = 'projects' in input ? input.projects : [input]
  const findings = projects.flatMap((project) => project.findings)
  const ruleIndexes = new Map(RULES.map((rule, index) => [rule.id, index]))
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'FlareCheck',
            semanticVersion: input.version,
            informationUri: 'https://flarecheck.loke.dev/',
            rules: RULES.map((rule) => ({
              id: rule.id,
              shortDescription: { text: rule.title },
              helpUri: rule.helpUri,
              properties: {
                tags: ['cloudflare-workers', 'configuration'],
              },
            })),
          },
        },
        results: findings.map((finding) => {
          const uri = sarifUri(finding.path, cwd)
          return {
            ruleId: finding.ruleId,
            ruleIndex: ruleIndexes.get(finding.ruleId),
            level: sarifLevel(finding),
            message: {
              text: [
                finding.message,
                finding.suggestion ? `Fix: ${finding.suggestion}` : undefined,
              ]
                .filter(Boolean)
                .join(' '),
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri },
                  region: { startLine: finding.line ?? 1 },
                },
              },
            ],
            partialFingerprints: {
              'flarecheck/v1': createHash('sha256')
                .update(`${finding.ruleId}\0${uri}\0${finding.title}`)
                .digest('hex'),
            },
          }
        }),
      },
    ],
  }

  return `${JSON.stringify(sarif, null, 2)}\n`
}

function formatFinding(finding: Finding, c: Colors): string[] {
  const icon =
    finding.severity === 'error'
      ? c.red('✗ ERROR')
      : finding.severity === 'warning'
        ? c.yellow('! WARNING')
        : c.cyan('i INFO')
  const lines = [
    `${icon} ${c.dim(terminalText(finding.ruleId))}  ${c.bold(terminalText(finding.title))}`,
    `  ${terminalText(finding.message)}`,
  ]
  if (finding.suggestion) lines.push(`  ${c.green('Fix:')} ${terminalText(finding.suggestion)}`)
  if (finding.docs) lines.push(`  ${c.dim(terminalText(finding.docs))}`)
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

function sarifUri(path: string, cwd: string): string {
  const relativePath = relative(cwd, path)
  if (relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)) {
    return relativePath.split(sep).map(encodeURIComponent).join('/')
  }
  return pathToFileURL(path).href
}

function sarifLevel(finding: Finding): 'error' | 'warning' | 'note' {
  if (finding.severity === 'error') return 'error'
  if (finding.severity === 'warning') return 'warning'
  return 'note'
}

function escapeData(value: string): string {
  return value
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, (character) => (
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    ))
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
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
