import type { Session } from '../../src/domain'
import type {
  DetachByConnectionIdResult,
  SessionConnection,
  SessionLifecycleRepository,
  StartOrReattachSessionInput,
  StartOrReattachSessionResult,
} from '../../src/ports/session-lifecycle-repository'

export interface StoredSession {
  session: Session
  connection: SessionConnection | undefined
}

export class InMemorySessionLifecycleRepository implements SessionLifecycleRepository {
  readonly sessions = new Map<string, StoredSession>()
  readonly connectionToSession = new Map<string, string>()

  async startOrReattach(
    input: StartOrReattachSessionInput,
  ): Promise<StartOrReattachSessionResult> {
    const stored = this.sessions.get(input.session.sessionId)
    if (stored === undefined) {
      this.sessions.set(input.session.sessionId, {
        session: input.session,
        connection: input.connection,
      })
      this.connectionToSession.set(
        input.connection.connectionId,
        input.session.sessionId,
      )
      return { kind: 'created' }
    }

    if (
      stored.session.sourceLanguage !== input.session.sourceLanguage ||
      stored.session.targetLanguage !== input.session.targetLanguage
    ) {
      return { kind: 'language_conflict' }
    }

    stored.connection = input.connection
    this.connectionToSession.set(
      input.connection.connectionId,
      input.session.sessionId,
    )
    return { kind: 'reattached' }
  }

  async detachByConnectionId(
    connectionId: string,
  ): Promise<DetachByConnectionIdResult> {
    const sessionId = this.connectionToSession.get(connectionId)
    if (sessionId === undefined) {
      return { kind: 'not_found' }
    }

    this.connectionToSession.delete(connectionId)
    const stored = this.sessions.get(sessionId)
    if (
      stored === undefined ||
      stored.connection?.connectionId !== connectionId
    ) {
      return { kind: 'superseded' }
    }

    stored.connection = undefined
    return { kind: 'detached' }
  }
}
