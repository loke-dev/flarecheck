import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CliArgumentError, parseArgs, wantsJson } from '../src/options.js'

describe('parseArgs', () => {
  it('parses a path, GitHub format, strict mode, and color preference', () => {
    expect(parseArgs(['./worker', '--format', 'github', '--strict'], true)).toEqual({
      inputPath: resolve('./worker'),
      format: 'github',
      strict: true,
      color: false,
      only: undefined,
      ignore: [],
      listRules: false,
      all: false,
    })
  })

  it('supports equals syntax and JSON error detection', () => {
    expect(parseArgs(['--format=json'], false).format).toBe('json')
    expect(parseArgs(['--sarif'], false).format).toBe('sarif')
    expect(wantsJson(['--format=json'])).toBe(true)
    expect(wantsJson(['--format', 'json'])).toBe(true)
  })

  it('rejects unknown formats and options', () => {
    expect(() => parseArgs(['--format', 'xml'])).toThrow(CliArgumentError)
    expect(() => parseArgs(['--wat'])).toThrow('Unknown option "--wat".')
  })

  it('rejects more than one project path', () => {
    expect(() => parseArgs(['one', 'two'])).toThrow(
      'Only one project path can be scanned at a time.',
    )
  })

  it('parses and normalizes rule selection', () => {
    expect(parseArgs(['--only', 'fc001, FC003']).only).toEqual(['FC001', 'FC003'])
    expect(parseArgs(['--ignore=fc007,fc008']).ignore).toEqual(['FC007', 'FC008'])
    expect(parseArgs(['./apps', '--all']).all).toBe(true)
  })

  it('rejects unknown, empty, and conflicting rule selection', () => {
    expect(() => parseArgs(['--only', 'FC999'])).toThrow(
      'Unknown rule FC999. Run --list-rules to see available rules.',
    )
    expect(() => parseArgs(['--ignore='])).toThrow('Rule lists cannot be empty.')
    expect(() => parseArgs(['--only=FC001', '--ignore=FC002'])).toThrow(
      '--only and --ignore cannot be used together.',
    )
  })
})
