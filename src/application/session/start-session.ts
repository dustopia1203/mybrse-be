import {
  APPLICATION_ERROR_RETRYABILITY,
  SessionSchema,
  type ApplicationError,
  type LanguageCode,
  type SessionId,
  type UnixTimeMilliseconds,
} from '../../domain'
import type { SessionConnection, SessionLifecycleRepository } from '../../ports'

export interface StartSessionInput {
  sessionId: SessionId
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  connection: SessionConnection
}

export type StartSessionResult =
  | { kind: 'started'; sessionId: SessionId }
  | { kind: 'reattached'; sessionId: SessionId }
  | { kind: 'rejected'; error: ApplicationError }
  | { kind: 'failed'; error: ApplicationError }

export interface StartSessionDependencies {
  repository: SessionLifecycleRepository
  nowMs: () => UnixTimeMilliseconds
  sessionRetentionSeconds: number
}

export const createStartSession =
  ({ repository, nowMs, sessionRetentionSeconds }: StartSessionDependencies) =>
  async (input: StartSessionInput): Promise<StartSessionResult> => {
    const createdAtMs = nowMs()
    const candidateSession = SessionSchema.safeParse({
      sessionId: input.sessionId,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      createdAtMs,
      expiresAt: Math.floor(createdAtMs / 1_000) + sessionRetentionSeconds,
    })
    if (!candidateSession.success) {
      return {
        kind: 'failed',
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Session timing configuration is invalid',
          retryable: APPLICATION_ERROR_RETRYABILITY.CONFIGURATION_ERROR,
        },
      }
    }

    const result = await repository.startOrReattach({
      session: candidateSession.data,
      connection: input.connection,
    })

    switch (result.kind) {
      case 'created':
        return { kind: 'started', sessionId: input.sessionId }
      case 'reattached':
        return { kind: 'reattached', sessionId: input.sessionId }
      case 'language_conflict':
        return {
          kind: 'rejected',
          error: {
            code: 'INVALID_INPUT',
            message:
              'Session language pair does not match the existing session',
            retryable: APPLICATION_ERROR_RETRYABILITY.INVALID_INPUT,
          },
        }
      case 'failed':
        return result
    }
  }
