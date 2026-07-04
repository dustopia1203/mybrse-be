import { describe, expect, it } from 'vitest'

import { SessionSchema } from '../../src/domain/session'
import { SESSION_ID } from '../fixtures/ids'

const validSession = {
  sessionId: SESSION_ID,
  sourceLanguage: 'ja',
  targetLanguage: 'vi',
  createdAtMs: 1_750_000_000_000,
  expiresAt: 1_750_086_400,
}

describe('SessionSchema', () => {
  it('parses the canonical session shape', () => {
    expect(SessionSchema.parse(validSession)).toEqual(validSession)
  })

  it('trims session and language identifiers through scalar schemas', () => {
    expect(
      SessionSchema.parse({
        ...validSession,
        sessionId: ` ${SESSION_ID.toUpperCase()} `,
        sourceLanguage: ' ja ',
      }),
    ).toEqual(validSession)
  })

  it('rejects connection fields outside the canonical shape', () => {
    expect(() =>
      SessionSchema.parse({
        ...validSession,
        connectionId: 'connection-1',
      }),
    ).toThrow()
  })

  it('rejects a blank source language', () => {
    expect(() =>
      SessionSchema.parse({
        ...validSession,
        sourceLanguage: ' ',
      }),
    ).toThrow()
  })
})
