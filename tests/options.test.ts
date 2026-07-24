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
    })
  })

  it('supports equals syntax and JSON error detection', () => {
    expect(parseArgs(['--format=json'], false).format).toBe('json')
    expect(wantsJson(['--format=json'])).toBe(true)
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
})
