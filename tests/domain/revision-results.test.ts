import { describe, expect, it } from 'vitest'

import {
  CurrentRevisionResultSchema,
  RevisionAcceptanceResultSchema,
} from '../../src/domain'

describe('RevisionAcceptanceResultSchema', () => {
  it('parses an accepted revision', () => {
    const result = { kind: 'accepted', revision: 4 }

    expect(RevisionAcceptanceResultSchema.parse(result)).toEqual(result)
  })

  it('parses a stale revision', () => {
    const result = {
      kind: 'stale',
      submittedRevision: 3,
      currentRevision: 4,
    }

    expect(RevisionAcceptanceResultSchema.parse(result)).toEqual(result)
  })

  it('rejects a stale result without the current revision', () => {
    expect(() =>
      RevisionAcceptanceResultSchema.parse({
        kind: 'stale',
        submittedRevision: 3,
      }),
    ).toThrow()
  })

  it('rejects an unknown result kind', () => {
    expect(() =>
      RevisionAcceptanceResultSchema.parse({
        kind: 'duplicate',
        revision: 4,
      }),
    ).toThrow()
  })

  it('rejects fields outside the accepted result shape', () => {
    expect(() =>
      RevisionAcceptanceResultSchema.parse({
        kind: 'accepted',
        revision: 4,
        acceptedAt: 1_700_000_000,
      }),
    ).toThrow()
  })
})

describe('CurrentRevisionResultSchema', () => {
  it('parses the current revision', () => {
    const result = { kind: 'current', revision: 4 }

    expect(CurrentRevisionResultSchema.parse(result)).toEqual(result)
  })

  it('parses a non-current revision with the current revision', () => {
    const result = {
      kind: 'not_current',
      attemptedRevision: 3,
      currentRevision: 4,
    }

    expect(CurrentRevisionResultSchema.parse(result)).toEqual(result)
  })

  it('parses a non-current revision without the current revision', () => {
    const result = { kind: 'not_current', attemptedRevision: 3 }

    expect(CurrentRevisionResultSchema.parse(result)).toEqual(result)
  })

  it('rejects an unknown result kind', () => {
    expect(() =>
      CurrentRevisionResultSchema.parse({
        kind: 'stale',
        attemptedRevision: 3,
      }),
    ).toThrow()
  })

  it('rejects a non-current result without the attempted revision', () => {
    expect(() =>
      CurrentRevisionResultSchema.parse({
        kind: 'not_current',
        currentRevision: 4,
      }),
    ).toThrow()
  })

  it('rejects fields outside the current result shape', () => {
    expect(() =>
      CurrentRevisionResultSchema.parse({
        kind: 'current',
        revision: 4,
        checkedAt: 1_700_000_000,
      }),
    ).toThrow()
  })
})
