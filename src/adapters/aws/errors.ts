import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
  type ApplicationErrorCode,
} from '../../domain'

type ErrorRecord = Record<string, unknown>

const TRANSPORT_ERROR_NAMES = new Set([
  'TimeoutError',
  'RequestTimeout',
  'NetworkingError',
])

export interface ProviderErrorPolicy {
  transientNames: ReadonlySet<string>
  rejectedNames: ReadonlySet<string>
  configurationNames: ReadonlySet<string>
}

function asRecord(value: unknown): ErrorRecord | undefined {
  return typeof value === 'object' && value !== null
    ? (value as ErrorRecord)
    : undefined
}

function errorName(error: unknown): string | undefined {
  const name = asRecord(error)?.name
  return typeof name === 'string' ? name : undefined
}

function statusCode(error: unknown): number | undefined {
  const metadata = asRecord(asRecord(error)?.$metadata)
  const status = metadata?.httpStatusCode
  return typeof status === 'number' ? status : undefined
}

function hasRetryableMarker(error: unknown): boolean {
  return asRecord(error)?.$retryable !== undefined
}

function applicationError(
  code: ApplicationErrorCode,
  message: string,
): ApplicationError {
  return {
    code,
    message,
    retryable: APPLICATION_ERROR_RETRYABILITY[code],
  }
}

export function isAwsFailure(error: unknown): boolean {
  const record = asRecord(error)
  return (
    typeof record?.name === 'string' &&
    (TRANSPORT_ERROR_NAMES.has(record.name) ||
      '$fault' in record ||
      '$metadata' in record ||
      '$retryable' in record)
  )
}

export function providerFailure(
  error: unknown,
  policy: ProviderErrorPolicy,
): ApplicationError {
  const name = errorName(error)
  const status = statusCode(error)

  if (name !== undefined && policy.configurationNames.has(name)) {
    return applicationError(
      'CONFIGURATION_ERROR',
      'The translation provider configuration is invalid.',
    )
  }
  if (
    (name !== undefined && policy.transientNames.has(name)) ||
    hasRetryableMarker(error) ||
    (status !== undefined && status >= 500)
  ) {
    return applicationError(
      'PROVIDER_UNAVAILABLE',
      'The translation provider is temporarily unavailable.',
    )
  }
  if (
    (name !== undefined && policy.rejectedNames.has(name)) ||
    (status !== undefined && status >= 400 && status < 500)
  ) {
    return applicationError(
      'PROVIDER_REJECTED',
      'The translation provider rejected the request.',
    )
  }
  return internalAdapterFailure()
}

export function internalAdapterFailure(): ApplicationError {
  return applicationError(
    'INTERNAL_ERROR',
    'The AWS adapter received an invalid result.',
  )
}

export function queueUnavailable(): ApplicationError {
  return applicationError(
    'QUEUE_UNAVAILABLE',
    'The refinement queue is unavailable.',
  )
}

export function publishUnavailable(): ApplicationError {
  return applicationError(
    'PUBLISH_UNAVAILABLE',
    'The WebSocket publisher is unavailable.',
  )
}

export function connectionGone(): ApplicationError {
  return applicationError(
    'CONNECTION_GONE',
    'The WebSocket connection is no longer available.',
  )
}

export function isConnectionGone(error: unknown): boolean {
  return errorName(error) === 'GoneException' || statusCode(error) === 410
}
