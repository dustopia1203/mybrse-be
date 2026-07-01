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

describe.each([
  ['LanguageCodeSchema', LanguageCodeSchema],
  ['SessionIdSchema', SessionIdSchema],
  ['SegmentIdSchema', SegmentIdSchema],
])('%s', (_name, schema) => {
  it('trims surrounding whitespace', () => {
    expect(schema.parse('  value  ')).toBe('value')
  })

  it('rejects blank strings', () => {
    expect(() => schema.parse('   ')).toThrow()
  })
})

describe.each([
  ['SequenceSchema', SequenceSchema],
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
