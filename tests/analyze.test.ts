import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyze, analyzeAll } from '../src/analyze.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')
const now = new Date('2026-07-24T12:00:00Z')

describe('analyze', () => {
  it('passes a deliberate production configuration', async () => {
    const result = await analyze(resolve(fixtures, 'healthy'), { now })

    expect(result.score).toBe(100)
    expect(result.findings).toEqual([])
    expect(result.summary).toEqual({
      errors: 0,
      warnings: 0,
      info: 0,
      passed: 8,
    })
  })

  it('finds high-confidence production risks', async () => {
    const result = await analyze(resolve(fixtures, 'risky'), { now })

    expect(result.score).toBe(40)
    expect(result.summary).toEqual({
      errors: 1,
      warnings: 5,
      info: 0,
      passed: 2,
    })
    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      'FC001',
      'FC002',
      'FC003',
      'FC004',
      'FC005',
      'FC006',
    ])
    expect(result.findings.find((finding) => finding.ruleId === 'FC003')?.title).toContain(
      'API_KEY',
    )
  })

  it('supports Wrangler TOML and recommends JSONC without failing', async () => {
    const result = await analyze(resolve(fixtures, 'toml'), { now })

    expect(result.score).toBe(100)
    expect(result.summary.info).toBe(1)
    expect(result.findings[0]?.ruleId).toBe('FC007')
  })

  it('finds stateful resources shared with production', async () => {
    const result = await analyze(resolve(fixtures, 'shared-resource'), { now })

    expect(result.score).toBe(92)
    expect(result.summary).toEqual({
      errors: 0,
      warnings: 1,
      info: 0,
      passed: 7,
    })
    expect(result.findings[0]).toMatchObject({
      ruleId: 'FC008',
      severity: 'warning',
      title: 'staging shares a production D1 database',
    })
    expect(result.findings[0]?.message).toContain('env.production')
  })

  it('can run only selected rules', async () => {
    const result = await analyze(resolve(fixtures, 'risky'), {
      now,
      only: ['FC003', 'FC006'],
    })

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(['FC003', 'FC006'])
    expect(result.summary).toEqual({
      errors: 1,
      warnings: 1,
      info: 0,
      passed: 0,
    })
  })

  it('can ignore selected rules', async () => {
    const result = await analyze(resolve(fixtures, 'healthy'), {
      now,
      ignore: ['FC007', 'FC008'],
    })

    expect(result.summary.passed).toBe(6)
    expect(result.passed.map((rule) => rule.ruleId)).not.toContain('FC007')
  })

  it('recursively scans every Worker in a directory', async () => {
    const result = await analyzeAll(fixtures, { now, only: ['FC003'] })

    expect(result.summary.projects).toBe(4)
    expect(result.projects.map((project) => project.configPath)).toEqual([
      resolve(fixtures, 'healthy/wrangler.jsonc'),
      resolve(fixtures, 'risky/wrangler.jsonc'),
      resolve(fixtures, 'shared-resource/wrangler.jsonc'),
      resolve(fixtures, 'toml/wrangler.toml'),
    ])
    expect(result.summary).toEqual({
      projects: 4,
      averageScore: 95,
      errors: 1,
      warnings: 0,
      info: 0,
      passed: 3,
    })
  })
})
