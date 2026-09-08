import type { ApplicationError } from '../domain'
import type { SessionConnection } from './session-lifecycle-repository'
import type { SessionRevisionReference } from './session-state-repository'

export interface DraftPublication {
  reference: SessionRevisionReference
  text: string
  isFinal: boolean
}

export interface RefinedPublication {
  reference: SessionRevisionReference
  text: string
}

export interface CorrelatedErrorPublication {
  stage: 'draft' | 'refinement_queue'
  reference: SessionRevisionReference
  error: ApplicationError
}

export type PublishResult =
  { kind: 'published' } | { kind: 'failed'; error: ApplicationError }

/**
 * Publishes revision-correlated events to the supplied connection.
 * A published result confirms transport acceptance, not client processing.
 * Transport failures, including a gone connection, are returned as errors.
 */
export interface SubtitlePublisher {
  publishDraft(
    connection: SessionConnection,
    publication: DraftPublication,
  ): Promise<PublishResult>
  publishError(
    connection: SessionConnection,
    publication: CorrelatedErrorPublication,
  ): Promise<PublishResult>
  publishRefined(
    connection: SessionConnection,
    publication: RefinedPublication,
  ): Promise<PublishResult>
}
