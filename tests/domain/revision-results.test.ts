import { describe, expect, it } from 'vitest'

import {
  CurrentRevisionResultSchema,
  RevisionAcceptanceResultSchema,
} from '../../src/domain/revision-results'

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
})
