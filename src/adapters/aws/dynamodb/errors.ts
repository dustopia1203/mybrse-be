import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
} from '../../../domain'

export function persistenceFailure(): ApplicationError {
  const code = 'PERSISTENCE_UNAVAILABLE'
  return {
    code,
    message: 'DynamoDB operation failed',
    retryable: APPLICATION_ERROR_RETRYABILITY[code],
  }
}

export function invalidPersistedState(): ApplicationError {
  const code = 'INTERNAL_ERROR'
  return {
    code,
    message: 'Persisted translation state is invalid',
    retryable: APPLICATION_ERROR_RETRYABILITY[code],
  }
}

export function rejectedError(
  code: 'INVALID_INPUT' | 'SESSION_NOT_FOUND' | 'SEGMENT_CONFLICT',
  message: string,
): ApplicationError {
  return {
    code,
    message,
    retryable: APPLICATION_ERROR_RETRYABILITY[code],
  }
}

export function isConditionalFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false
  }
  return (
    error.name === 'ConditionalCheckFailedException' ||
    error.name === 'TransactionCanceledException'
  )
}
