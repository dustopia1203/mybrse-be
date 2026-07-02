import { describe, expect, it } from 'vitest'

import {
  APPLICATION_ERROR_RETRYABILITY,
  ApplicationErrorCodeSchema,
  ApplicationErrorSchema,
} from '../../src/domain/application-error'

describe('ApplicationErrorSchema', () => {
  it('parses every application error code with its normalized retryability', () => {
    for (const code of ApplicationErrorCodeSchema.options) {
      const error = {
        code,
        message: `Normalized ${code}`,
        retryable: APPLICATION_ERROR_RETRYABILITY[code],
      }

      expect(ApplicationErrorSchema.parse(error)).toEqual(error)
    }
  })

  it('rejects retryability that does not match the application error code', () => {
    for (const code of ApplicationErrorCodeSchema.options) {
      expect(() =>
        ApplicationErrorSchema.parse({
          code,
          message: `Normalized ${code}`,
          retryable: !APPLICATION_ERROR_RETRYABILITY[code],
        }),
      ).toThrow('retryable must match the application error code')
    }
  })

  it('rejects a blank message', () => {
    expect(() =>
      ApplicationErrorSchema.parse({
        code: 'INTERNAL_ERROR',
        message: '',
        retryable: false,
      }),
    ).toThrow()
  })

  it('rejects provider SDK and transcript details outside the stable shape', () => {
    expect(() =>
      ApplicationErrorSchema.parse({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Provider unavailable',
        retryable: true,
        sdkError: { status: 503 },
        transcriptText: 'partial transcript',
      }),
    ).toThrow()
  })
})
