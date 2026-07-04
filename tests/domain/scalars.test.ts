import { describe, expect, it } from 'vitest'

import {
  LanguageCodeSchema,
  MediaOffsetMillisecondsSchema,
  RevisionSchema,
  SegmentIdSchema,
  SequenceSchema,
  SessionIdSchema,
  UnixTimeMillisecondsSchema,
  UnixTimeSecondsSchema,
} from '../../src/domain/scalars'
import { SESSION_ID } from '../fixtures/ids'

describe('LanguageCodeSchema', () => {
  it('trims surrounding whitespace', () => {
    expect(LanguageCodeSchema.parse('  ja  ')).toBe('ja')
  })

  it('rejects blank strings', () => {
    expect(() => LanguageCodeSchema.parse('   ')).toThrow()
  })
})

describe.each([
  ['SessionIdSchema', SessionIdSchema],
  ['SegmentIdSchema', SegmentIdSchema],
])('%s', (_name, schema) => {
  it('accepts UUID v7 and normalizes it to lowercase', () => {
    expect(schema.parse(` ${SESSION_ID.toUpperCase()} `)).toBe(SESSION_ID)
  })

  it.each([
    's-123',
    '550e8400-e29b-41d4-a716-446655440000',
    '0192f3a0-7b5c-6c8d-8e9f-0123456789ab',
  ])('rejects non-v7 value %s', (value) => {
    expect(() => schema.parse(value)).toThrow()
  })
})

describe('SequenceSchema', () => {
  it.each([0, 9_999_999_999])('accepts %s', (value) => {
    expect(SequenceSchema.parse(value)).toBe(value)
  })

  it.each([-1, 1.5, 10_000_000_000])('rejects %s', (value) => {
    expect(() => SequenceSchema.parse(value)).toThrow()
  })
})

describe.each([
  ['RevisionSchema', RevisionSchema],
  ['UnixTimeMillisecondsSchema', UnixTimeMillisecondsSchema],
  ['UnixTimeSecondsSchema', UnixTimeSecondsSchema],
  ['MediaOffsetMillisecondsSchema', MediaOffsetMillisecondsSchema],
])('%s', (_name, schema) => {
  it.each([0, Number.MAX_SAFE_INTEGER])('accepts %s', (value) => {
    expect(schema.parse(value)).toBe(value)
  })

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects %s', (value) => {
    expect(() => schema.parse(value)).toThrow()
  })
})
