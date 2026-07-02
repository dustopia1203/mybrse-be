import { z } from 'zod'

export const ApplicationErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNSUPPORTED_ACTION',
  'CONFIGURATION_ERROR',
  'SESSION_NOT_FOUND',
  'SEGMENT_CONFLICT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_REJECTED',
  'PERSISTENCE_UNAVAILABLE',
  'QUEUE_UNAVAILABLE',
  'PUBLISH_UNAVAILABLE',
  'CONNECTION_GONE',
  'INTERNAL_ERROR',
])
export type ApplicationErrorCode = z.infer<typeof ApplicationErrorCodeSchema>

export const APPLICATION_ERROR_RETRYABILITY = {
  INVALID_INPUT: false,
  UNSUPPORTED_ACTION: false,
  CONFIGURATION_ERROR: false,
  SESSION_NOT_FOUND: false,
  SEGMENT_CONFLICT: false,
  PROVIDER_UNAVAILABLE: true,
  PROVIDER_REJECTED: false,
  PERSISTENCE_UNAVAILABLE: true,
  QUEUE_UNAVAILABLE: true,
  PUBLISH_UNAVAILABLE: true,
  CONNECTION_GONE: false,
  INTERNAL_ERROR: false,
} as const satisfies Record<ApplicationErrorCode, boolean>

export const ApplicationErrorSchema = z
  .strictObject({
    code: ApplicationErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .superRefine((error, context) => {
    if (error.retryable !== APPLICATION_ERROR_RETRYABILITY[error.code]) {
      context.addIssue({
        code: 'custom',
        message: 'retryable must match the application error code',
        path: ['retryable'],
      })
    }
  })
export type ApplicationError = z.infer<typeof ApplicationErrorSchema>
