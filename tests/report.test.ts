import { describe, expect, it } from 'vitest'
import { formatGitHub, formatHuman, formatSarif } from '../src/report.js'
import type { ScanResult } from '../src/types.js'

describe('formatGitHub', () => {
  it('emits file annotations with escaped titles and multiline details', () => {
    const result = scanResult({
      findings: [
        {
          ruleId: 'FC008',
          severity: 'warning',
          title: 'staging shares a production D1 database',
          message: 'env.staging.DB points to production.',
          path: '/repo/wrangler.jsonc',
          line: 14,
          suggestion: 'Use a separate database.',
          docs: 'https://example.com/docs',
        },
      ],
    })

    expect(formatGitHub(result, '/repo')).toBe(
      '::warning file=wrangler.jsonc,line=14,title=FC008%3A staging shares a production D1 database::env.staging.DB points to production.%0AFix: Use a separate database.%0Ahttps://example.com/docs\n',
    )
  })

  it('emits a notice when every check passes', () => {
    const result = scanResult({ findings: [], score: 100 })

    expect(formatGitHub(result, '/repo')).toBe(
      '::notice file=wrangler.jsonc,title=FlareCheck 100/100::No production-readiness findings.\n',
    )
  })
})

describe('formatSarif', () => {
  it('emits SARIF 2.1.0 rules, results, locations, and stable fingerprints', () => {
    const result = scanResult({
      findings: [
        {
          ruleId: 'FC003',
          severity: 'error',
          title: 'Likely secret committed as API_KEY',
          message: 'vars.API_KEY looks sensitive.',
          path: '/repo/apps/api/wrangler.jsonc',
          line: 6,
          suggestion: 'Store it as a secret.',
        },
      ],
    })

    const sarif = JSON.parse(formatSarif(result, '/repo'))
    expect(sarif.version).toBe('2.1.0')
    expect(sarif.runs[0].tool.driver).toMatchObject({
      name: 'FlareCheck',
      semanticVersion: '0.3.0',
    })
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(9)
    expect(sarif.runs[0].results[0]).toMatchObject({
      ruleId: 'FC003',
      ruleIndex: 2,
      level: 'error',
      message: { text: 'vars.API_KEY looks sensitive. Fix: Store it as a secret.' },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'apps/api/wrangler.jsonc' },
            region: { startLine: 6 },
          },
        },
      ],
    })
    expect(sarif.runs[0].results[0].partialFingerprints['flarecheck/v1']).toHaveLength(64)
  })
})

it('renders configuration control characters visibly', () => {
  const unsafe = 'api\n\u001b[31mowned'
  const result = scanResult({
    configPath: `/repo/${unsafe}.jsonc`,
    findings: [{
      ruleId: 'FC003',
      severity: 'error',
      title: unsafe,
      message: `Target ${unsafe} is unsafe.`,
      path: `/repo/${unsafe}.jsonc`,
      suggestion: `Remove ${unsafe}.`,
    }],
  })

  const human = formatHuman(result, false)
  const github = formatGitHub(result, '/repo')

  expect(human).toContain('api\\n\\u001b[31mowned')
  expect(github).toContain('api%0A\\u001b[31mowned')
  expect(human).not.toContain('\u001b')
  expect(github).not.toContain('\u001b')
  expect(human).not.toContain('\nowned')
  expect(github).not.toContain('\nowned')
})

function scanResult(overrides: Partial<ScanResult>): ScanResult {
  return {
    version: '0.3.0',
    configPath: '/repo/wrangler.jsonc',
    score: 92,
    findings: [],
    passed: [],
    summary: {
      errors: 0,
      warnings: 0,
      info: 0,
      passed: 9,
    },
    ...overrides,
  }
}
