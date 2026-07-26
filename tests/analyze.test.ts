import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyze, analyzeAll } from '../src/analyze.js'
import { ConfigError } from '../src/config.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')
const now = new Date('2026-07-24T12:00:00Z')

describe('analyze', () => {
  it('classifies missing single-project paths as configuration errors', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'flarecheck-missing-'))
    try {
      await expect(
        analyze(join(temporary, 'wrangler.jsonc'), { now }),
      ).rejects.toBeInstanceOf(ConfigError)
    } finally {
      await rm(temporary, { recursive: true })
    }
  })

  it('passes a deliberate production configuration', async () => {
    const result = await analyze(resolve(fixtures, 'healthy'), { now })

    expect(result.score).toBe(100)
    expect(result.findings).toEqual([])
    expect(result.summary).toEqual({
      errors: 0,
      warnings: 0,
      info: 0,
      passed: 9,
    })
  })

  it('finds high-confidence production risks', async () => {
    const result = await analyze(resolve(fixtures, 'risky'), { now })

    expect(result.score).toBe(40)
    expect(result.summary).toEqual({
      errors: 1,
      warnings: 5,
      info: 0,
      passed: 3,
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
    expect(result.findings.find((finding) => finding.ruleId === 'FC003')?.line).toBe(6)
    expect(result.findings.find((finding) => finding.ruleId === 'FC005')?.line).toBe(17)
    expect(result.findings.find((finding) => finding.ruleId === 'FC006')).toMatchObject({
      path: resolve(fixtures, 'risky/package.json'),
      line: 3,
    })
  })

  it('rejects impossible compatibility dates instead of normalizing them', async () => {
    const result = await analyze(resolve(import.meta.dirname, 'fixtures-invalid-date'), {
      now,
      only: ['FC001'],
    })

    expect(result.score).toBe(80)
    expect(result.summary).toEqual({
      errors: 1,
      warnings: 0,
      info: 0,
      passed: 0,
    })
    expect(result.findings[0]).toMatchObject({
      ruleId: 'FC001',
      severity: 'error',
      title: 'Invalid compatibility date',
      line: 4,
      suggestion: 'Use a real calendar date in YYYY-MM-DD format, for example "2026-07-24".',
    })
  })

  it('supports Wrangler TOML and recommends JSONC without failing', async () => {
    const result = await analyze(resolve(fixtures, 'toml'), { now })

    expect(result.score).toBe(100)
    expect(result.summary.info).toBe(1)
    expect(result.findings[0]?.ruleId).toBe('FC007')
    expect(result.findings[0]?.line).toBe(1)
  })

  it('finds stateful resources shared with production', async () => {
    const result = await analyze(resolve(fixtures, 'shared-resource'), { now })

    expect(result.score).toBe(92)
    expect(result.summary).toEqual({
      errors: 0,
      warnings: 1,
      info: 0,
      passed: 8,
    })
    expect(result.findings[0]).toMatchObject({
      ruleId: 'FC008',
      severity: 'warning',
      title: 'staging shares a production D1 database',
      line: 25,
    })
    expect(result.findings[0]?.message).toContain('env.production')
  })

  it('tracks current non-inherited bindings without flagging inherited metadata', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'flarecheck-current-bindings-'))
    try {
      const currentBindings = [
        'agent_memory',
        'ai_search',
        'ai_search_namespaces',
        'artifacts',
        'flagship',
        'media',
        'pipelines',
        'ratelimits',
        'secrets',
        'secrets_store_secrets',
        'send_email',
        'stream',
        'streaming_tail_consumers',
        'tail_consumers',
        'unsafe',
        'vpc_networks',
        'vpc_services',
        'websearch',
        'worker_loaders',
      ]
      await writeFile(
        join(temporary, 'wrangler.jsonc'),
        JSON.stringify({
          name: 'current-bindings',
          version_metadata: { binding: 'VERSION' },
          ...Object.fromEntries(currentBindings.map((key) => [key, {}])),
          env: { staging: {} },
        }),
      )

      const result = await analyze(temporary, { now, only: ['FC005'] })

      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]?.message).toBe(
        `${currentBindings.join(', ')} are defined at the root but not in env.staging.`,
      )
      expect(result.findings[0]?.message).not.toContain('version_metadata')
    } finally {
      await rm(temporary, { recursive: true })
    }
  })

  it('requires explicit targets for routed environments', async () => {
    const result = await analyze(resolve(fixtures, 'routing'), { now })

    expect(result.score).toBe(92)
    expect(result.summary).toEqual({
      errors: 0,
      warnings: 1,
      info: 0,
      passed: 8,
    })
    expect(result.findings[0]).toMatchObject({
      ruleId: 'FC009',
      severity: 'warning',
      title: 'staging has no explicit route target',
      line: 15,
    })
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

    expect(result.summary.passed).toBe(7)
    expect(result.passed.map((rule) => rule.ruleId)).not.toContain('FC007')
  })

  it('recursively scans every Worker in a directory', async () => {
    const result = await analyzeAll(fixtures, { now, only: ['FC003'] })

    expect(result.summary.projects).toBe(5)
    expect(result.projects.map((project) => project.configPath)).toEqual([
      resolve(fixtures, 'healthy/wrangler.jsonc'),
      resolve(fixtures, 'risky/wrangler.jsonc'),
      resolve(fixtures, 'routing/wrangler.jsonc'),
      resolve(fixtures, 'shared-resource/wrangler.jsonc'),
      resolve(fixtures, 'toml/wrangler.toml'),
    ])
    expect(result.summary).toEqual({
      projects: 5,
      averageScore: 96,
      errors: 1,
      warnings: 0,
      info: 0,
      passed: 4,
    })
  })

  it('ignores Wrangler files inside framework build directories', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'flarecheck-generated-'))
    try {
      await writeFile(
        join(temporary, 'wrangler.json'),
        JSON.stringify({ name: 'source-worker' }),
      )
      for (const directory of ['.astro', '.next', '.nuxt', '.output', '.svelte-kit', '.vercel']) {
        await mkdir(join(temporary, directory), { recursive: true })
        await writeFile(
          join(temporary, directory, 'wrangler.json'),
          JSON.stringify({ name: `generated-${directory}` }),
        )
      }

      const result = await analyzeAll(temporary, { now, only: ['FC003'] })

      expect(result.summary.projects).toBe(1)
      expect(result.projects[0]?.configPath).toBe(join(temporary, 'wrangler.json'))
    } finally {
      await rm(temporary, { recursive: true })
    }
  })
})
