import { describe, expect, it } from 'vitest'

import { RefinementStatusSchema, SegmentSchema } from '../../src/domain/segment'

const validSegment = {
  sessionId: 's-123',
  segmentId: 'seg-10',
  sequence: 10,
  revision: 3,
  sourceText: 'こんにちは',
  isFinal: false,
  startMs: 1_200,
  endMs: 2_400,
}

describe('RefinementStatusSchema', () => {
  it('exposes the canonical refinement statuses', () => {
    expect(RefinementStatusSchema.options).toEqual([
      'PENDING',
      'QUEUED',
      'COMPLETED',
    ])
  })
})

describe('SegmentSchema', () => {
  it('parses a partial segment without translation fields', () => {
    expect(SegmentSchema.parse(validSegment)).toEqual(validSegment)
  })

  it('parses a structurally valid completed final segment', () => {
    const finalSegment = {
      ...validSegment,
      isFinal: true,
      draftText: 'Xin chào',
      refinedText: 'Xin chào.',
      refinementStatus: 'COMPLETED',
    }

    expect(SegmentSchema.parse(finalSegment)).toEqual(finalSegment)
  })

  it('accepts equal start and end offsets', () => {
    const zeroDurationSegment = {
      ...validSegment,
      endMs: validSegment.startMs,
    }

    expect(SegmentSchema.parse(zeroDurationSegment)).toEqual(
      zeroDurationSegment,
    )
  })

  it('rejects an end offset before the start offset', () => {
    const result = SegmentSchema.safeParse({
      ...validSegment,
      startMs: 2_400,
      endMs: 1_200,
    })

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('Expected segment validation to fail')
    }

    expect(result.error.issues).toHaveLength(1)
    expect(result.error.issues[0]?.message).toBe(
      'endMs must be greater than or equal to startMs',
    )
    expect(result.error.issues[0]?.path).toEqual(['endMs'])
  })

  it('rejects persistence attributes outside the canonical shape', () => {
    expect(() =>
      SegmentSchema.parse({
        ...validSegment,
        PK: 'SESSION#s-123',
      }),
    ).toThrow()
  })
})
