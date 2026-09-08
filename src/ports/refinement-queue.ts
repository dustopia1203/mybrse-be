import type { ApplicationError } from '../domain'
import type { SessionRevisionReference } from './session-state-repository'

export type EnqueueRefinementResult =
  { kind: 'enqueued' } | { kind: 'failed'; error: ApplicationError }

export interface RefinementQueue {
  /**
   * Enqueues a revision reference, without transcript or translation content.
   * Delivery may repeat; consumers must handle stale and duplicate jobs.
   */
  enqueue(reference: SessionRevisionReference): Promise<EnqueueRefinementResult>
}
