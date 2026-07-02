import { describe, expect, it } from 'vitest'

import {
  decodeWebSocketCommand,
  toContractErrorEvent,
} from '../../src/contracts'

const sessionStartCommand = {
  action: 'session.start',
  sessionId: 'session-123',
  sourceLanguage: 'en',
  targetLanguage: 'ja',
}

const transcriptUpsertCommand = {
  action: 'transcript.upsert',
  sessionId: 'session-123',
  segmentId: 'segment-456',
  sequence: 1,
  revision: 1,
  text: 'Hello',
  isFinal: false,
  startMs: 0,
  endMs: 1000,
}

describe('decodeWebSocketCommand', () => {
  it('returns malformed_json instead of throwing for invalid JSON', () => {
    expect(decodeWebSocketCommand('{"action":')).toEqual({
      kind: 'malformed_json',
    })
  })

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['an empty object', '{}'],
    ['a non-string action', '{"action":42}'],
    ['an incomplete session.start command', '{"action":"session.start"}'],
  ])('returns invalid_command for %s', (_description, raw) => {
    expect(decodeWebSocketCommand(raw)).toEqual({
      kind: 'invalid_command',
    })
  })

  it('returns unsupported_action for an unknown string action', () => {
    expect(decodeWebSocketCommand('{"action":"session.pause"}')).toEqual({
      kind: 'unsupported_action',
      action: 'session.pause',
    })
  })

  it.each([sessionStartCommand, transcriptUpsertCommand])(
    'decodes a valid $action command',
    (command) => {
      const result = decodeWebSocketCommand(JSON.stringify(command))

      expect(result).toEqual({
        kind: 'decoded',
        command,
      })
      expect(result.kind === 'decoded' && result.command.action).toBe(
        command.action,
      )
    },
  )
})

describe('toContractErrorEvent', () => {
  it.each([{ kind: 'malformed_json' }, { kind: 'invalid_command' }] as const)(
    'maps $kind to an uncorrelated INVALID_INPUT event',
    (failure) => {
      expect(toContractErrorEvent(failure)).toEqual({
        type: 'translation.error',
        stage: 'contract',
        code: 'INVALID_INPUT',
        retryable: false,
      })
    },
  )

  it('maps unsupported actions to an uncorrelated UNSUPPORTED_ACTION event', () => {
    expect(
      toContractErrorEvent({
        kind: 'unsupported_action',
        action: 'session.pause',
      }),
    ).toEqual({
      type: 'translation.error',
      stage: 'contract',
      code: 'UNSUPPORTED_ACTION',
      retryable: false,
    })
  })
})
