import { APPLICATION_ERROR_RETRYABILITY } from '../../domain'
import {
  SessionStartCommandSchema,
  TranscriptUpsertCommandSchema,
  type WebSocketCommand,
} from './commands'
import type { ContractTranslationErrorEvent } from './events'

export type DecodeWebSocketCommandResult =
  | {
      kind: 'decoded'
      command: WebSocketCommand
    }
  | {
      kind: 'malformed_json'
    }
  | {
      kind: 'invalid_command'
    }
  | {
      kind: 'unsupported_action'
      action: string
    }

export type WebSocketCommandDecodeFailure = Exclude<
  DecodeWebSocketCommandResult,
  { kind: 'decoded' }
>

function hasStringAction(value: unknown): value is { action: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'action' in value &&
    typeof value.action === 'string'
  )
}

export function decodeWebSocketCommand(
  raw: string,
): DecodeWebSocketCommandResult {
  let value: unknown

  try {
    value = JSON.parse(raw)
  } catch {
    return { kind: 'malformed_json' }
  }

  if (!hasStringAction(value)) {
    return { kind: 'invalid_command' }
  }

  const schema =
    value.action === 'session.start'
      ? SessionStartCommandSchema
      : value.action === 'transcript.upsert'
        ? TranscriptUpsertCommandSchema
        : undefined

  if (schema === undefined) {
    return {
      kind: 'unsupported_action',
      action: value.action,
    }
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    return { kind: 'invalid_command' }
  }

  return {
    kind: 'decoded',
    command: result.data,
  }
}

export function toContractErrorEvent(
  failure: WebSocketCommandDecodeFailure,
): ContractTranslationErrorEvent {
  const code =
    failure.kind === 'unsupported_action'
      ? 'UNSUPPORTED_ACTION'
      : 'INVALID_INPUT'

  return {
    type: 'translation.error',
    stage: 'contract',
    code,
    retryable: APPLICATION_ERROR_RETRYABILITY[code],
  }
}
