import { describe, expect, it } from 'vitest'

import { RefinementJobSchema } from '../../src/contracts'
import { readJsonFixture } from '../fixtures/read-json-fixture'

const job = readJsonFixture('refinement-job.json', 'refinement')
const invalidJob = readJsonFixture('invalid-refinement-job.json', 'refinement')

describe('RefinementJobSchema', () => {
  it('parses the canonical logical job fixture', () => {
    expect(RefinementJobSchema.parse(job)).toEqual(job)
  })

  it.each([
    ['sessionId', 'session-1'],
    ['segmentId', 'segment-1'],
    ['sequence', 10_000_000_000],
    ['revision', '4'],
  ])('rejects invalid %s', (field, value) => {
    expect(
      RefinementJobSchema.safeParse({
        ...(job as Record<string, unknown>),
        [field]: value,
      }).success,
    ).toBe(false)
  })

  it('rejects copied transcript content and unknown fields', () => {
    expect(
      RefinementJobSchema.safeParse({
        ...(job as Record<string, unknown>),
        sourceText: 'こんにちは',
      }).success,
    ).toBe(false)
  })

  it('rejects the malformed logical job fixture', () => {
    expect(RefinementJobSchema.safeParse(invalidJob).success).toBe(false)
  })
})
