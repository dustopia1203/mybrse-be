import { describe, expect, it } from 'vitest'

import {
  connectionGone,
  internalAdapterFailure,
  isAwsFailure,
  providerFailure,
  publishUnavailable,
  queueUnavailable,
} from '../../../src/adapters/aws/errors'

const policy = {
  transientNames: new Set(['TooManyRequestsException']),
  rejectedNames: new Set(['ValidationException']),
  configurationNames: new Set(['AccessDeniedException']),
}

describe('AWS adapter errors', () => {
  it.each([
    [
      { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } },
      'CONFIGURATION_ERROR',
    ],
    [
      {
        name: 'TooManyRequestsException',
        $metadata: { httpStatusCode: 400 },
      },
      'PROVIDER_UNAVAILABLE',
    ],
    [
      { name: 'ValidationException', $metadata: { httpStatusCode: 400 } },
      'PROVIDER_REJECTED',
    ],
    [
      { name: 'UnknownServiceError', $metadata: { httpStatusCode: 503 } },
      'PROVIDER_UNAVAILABLE',
    ],
    [
      { name: 'UnknownClientError', $metadata: { httpStatusCode: 422 } },
      'PROVIDER_REJECTED',
    ],
    [new Error('unknown'), 'INTERNAL_ERROR'],
  ])('normalizes provider failure %#', (thrown, code) => {
    expect(providerFailure(thrown, policy).code).toBe(code)
  })

  it('recognizes structural SDK failures without instanceof', () => {
    expect(isAwsFailure({ name: 'ServiceError', $fault: 'server' })).toBe(true)
    expect(isAwsFailure({ name: 'TimeoutError' })).toBe(true)
    expect(isAwsFailure('ServiceError')).toBe(false)
  })

  it('builds safe canonical operational errors', () => {
    expect(queueUnavailable()).toEqual({
      code: 'QUEUE_UNAVAILABLE',
      message: 'The refinement queue is unavailable.',
      retryable: true,
    })
    expect(publishUnavailable().code).toBe('PUBLISH_UNAVAILABLE')
    expect(connectionGone().code).toBe('CONNECTION_GONE')
    expect(internalAdapterFailure().code).toBe('INTERNAL_ERROR')
  })
})
