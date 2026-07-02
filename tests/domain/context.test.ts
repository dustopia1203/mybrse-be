import { describe, expect, it } from 'vitest'

import {
  TranslationContextEntrySchema,
  TranslationContextSchema,
} from '../../src/domain'

const draftEntry = {
  segmentId: 'seg-8',
  sequence: 8,
  sourceText: 'おはよう',
  translatedText: 'Chào buổi sáng',
  translationKind: 'draft',
}

const refinedEntry = {
  segmentId: 'seg-9',
  sequence: 9,
  sourceText: 'こんにちは',
  translatedText: 'Xin chào.',
  translationKind: 'refined',
}

describe('TranslationContextEntrySchema', () => {
  it('parses draft and refined translation context entries', () => {
    expect(TranslationContextEntrySchema.parse(draftEntry)).toEqual(draftEntry)
    expect(TranslationContextEntrySchema.parse(refinedEntry)).toEqual(
      refinedEntry,
    )
  })

  it('rejects unsupported translation kinds', () => {
    expect(() =>
      TranslationContextEntrySchema.parse({
        ...draftEntry,
        translationKind: 'source',
      }),
    ).toThrow()
  })

  it('rejects fields outside the canonical shape', () => {
    expect(() =>
      TranslationContextEntrySchema.parse({
        ...draftEntry,
        isFinal: true,
      }),
    ).toThrow()
  })
})

describe('TranslationContextSchema', () => {
  it('preserves caller ordering and length', () => {
    const context = [draftEntry, refinedEntry]

    expect(TranslationContextSchema.parse(context)).toEqual(context)
  })
})
