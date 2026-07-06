import {
  DraftTranslationErrorEventSchema,
  RefinementQueueTranslationErrorEventSchema,
  SubtitleDraftEventSchema,
  SubtitleRefinedEventSchema,
  type DraftTranslationErrorEvent,
  type RefinementQueueTranslationErrorEvent,
  type SubtitleDraftEvent,
  type SubtitleRefinedEvent,
} from '../../../contracts'
import type {
  CorrelatedErrorPublication,
  DraftPublication,
  RefinedPublication,
} from '../../../ports'

export type PublishableWebSocketEvent =
  | SubtitleDraftEvent
  | SubtitleRefinedEvent
  | DraftTranslationErrorEvent
  | RefinementQueueTranslationErrorEvent

export function toDraftEvent(
  publication: DraftPublication,
): SubtitleDraftEvent {
  return SubtitleDraftEventSchema.parse({
    type: 'subtitle.draft',
    ...publication.reference,
    text: publication.text,
    isFinal: publication.isFinal,
  })
}

export function toRefinedEvent(
  publication: RefinedPublication,
): SubtitleRefinedEvent {
  return SubtitleRefinedEventSchema.parse({
    type: 'subtitle.refined',
    ...publication.reference,
    text: publication.text,
    isFinal: true,
  })
}

export function toErrorEvent(
  publication: CorrelatedErrorPublication,
): DraftTranslationErrorEvent | RefinementQueueTranslationErrorEvent {
  const event = {
    type: 'translation.error' as const,
    stage: publication.stage,
    sessionId: publication.reference.sessionId,
    segmentId: publication.reference.segmentId,
    revision: publication.reference.revision,
    code: publication.error.code,
    retryable: publication.error.retryable,
  }
  return publication.stage === 'draft'
    ? DraftTranslationErrorEventSchema.parse(event)
    : RefinementQueueTranslationErrorEventSchema.parse(event)
}
