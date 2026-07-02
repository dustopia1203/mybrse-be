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
  startOrReattach(
    input: StartOrReattachSessionInput,
  ): Promise<StartOrReattachSessionResult>
  detachByConnectionId(
    connectionId: string,
  ): Promise<DetachByConnectionIdResult>
}
