import { describe, expect, it } from 'vitest'
import { formatGitHub } from '../src/report.js'
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
          suggestion: 'Use a separate database.',
          docs: 'https://example.com/docs',
        },
      ],
    })

    expect(formatGitHub(result, '/repo')).toBe(
      '::warning file=wrangler.jsonc,title=FC008%3A staging shares a production D1 database::env.staging.DB points to production.%0AFix: Use a separate database.%0Ahttps://example.com/docs\n',
    )
  })

  it('emits a notice when every check passes', () => {
    const result = scanResult({ findings: [], score: 100 })

    expect(formatGitHub(result, '/repo')).toBe(
      '::notice file=wrangler.jsonc,title=FlareCheck 100/100::No production-readiness findings.\n',
    )
  })
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
      passed: 8,
    },
    ...overrides,
  }
}
