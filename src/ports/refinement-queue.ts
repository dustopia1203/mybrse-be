import type { ApplicationError } from '../domain'
import type { SessionRevisionReference } from './session-state-repository'

export type EnqueueRefinementResult =
  { kind: 'enqueued' } | { kind: 'failed'; error: ApplicationError }

export interface RefinementQueue {
  enqueue(reference: SessionRevisionReference): Promise<EnqueueRefinementResult>
}
