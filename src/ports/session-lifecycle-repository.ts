import type { ApplicationError, Session } from '../domain'

export interface SessionConnection {
  connectionId: string
  callbackEndpoint: string
}

export interface StartOrReattachSessionInput {
  session: Session
  connection: SessionConnection
}

export type StartOrReattachSessionResult =
  | { kind: 'created' }
  | { kind: 'reattached' }
  | { kind: 'language_conflict' }
  | { kind: 'failed'; error: ApplicationError }

export type DetachByConnectionIdResult =
  | { kind: 'detached' }
  | { kind: 'not_found' }
  | { kind: 'superseded' }
  | { kind: 'failed'; error: ApplicationError }

export interface SessionLifecycleRepository {
  /**
   * Creates or reattaches a session, rejecting a change to its language pair.
   */
  startOrReattach(
    input: StartOrReattachSessionInput,
  ): Promise<StartOrReattachSessionResult>
  /**
   * Detaches only the matching connection, preserving session and segment data.
   * A delayed disconnect must not detach a newer connection.
   */
  detachByConnectionId(
    connectionId: string,
  ): Promise<DetachByConnectionIdResult>
}
