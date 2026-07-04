import { UpdateCommand } from '@aws-sdk/lib-dynamodb'

import { SequenceSchema } from '../../../domain'
import type {
  AcceptTranscriptRevisionResult,
  GetSegmentResult,
  GetSessionResult,
  MarkRefinementQueuedResult,
  SaveDraftResult,
  SaveRefinedResult,
  SessionRevisionReference,
  SessionStateRepository,
  TranscriptRevisionInput,
} from '../../../ports'
import {
  readSegmentItem,
  readSessionItem,
  type RepositoryDependencies,
} from './client'
import {
  invalidPersistedState,
  isConditionalFailure,
  persistenceFailure,
  rejectedError,
} from './errors'
import { SegmentItemSchema, segmentFromItem, sessionFromItem } from './items'
import { segmentKey } from './keys'

const ACCEPT_CONDITION =
  'attribute_not_exists(#PK) OR (#entityType = :segmentType AND #segmentId = :segmentId AND #revision < :revision)'
const ACCEPT_UPDATE =
  'SET #entityType = :segmentType, #sessionId = :sessionId, #segmentId = :segmentId, #sequence = :sequence, #revision = :revision, #sourceText = :sourceText, #isFinal = :isFinal, #startMs = :startMs, #endMs = :endMs, #expiresAt = :expiresAt REMOVE #draftText, #refinedText, #refinementStatus'
const CURRENT_DRAFT_CONDITION =
  '#entityType = :segmentType AND #segmentId = :segmentId AND #revision = :revision AND #isFinal = :isFinal AND attribute_not_exists(#draftText)'
const PENDING_CONDITION =
  '#entityType = :segmentType AND #segmentId = :segmentId AND #revision = :revision AND #isFinal = :true AND attribute_exists(#draftText) AND #refinementStatus = :pending'
const REFINABLE_CONDITION =
  '#entityType = :segmentType AND #segmentId = :segmentId AND #revision = :revision AND #isFinal = :true AND attribute_exists(#draftText) AND attribute_not_exists(#refinedText) AND (#refinementStatus = :pending OR #refinementStatus = :queued)'
const STATE_NAMES = {
  '#entityType': 'entityType',
  '#segmentId': 'segmentId',
  '#revision': 'revision',
  '#isFinal': 'isFinal',
  '#draftText': 'draftText',
  '#refinedText': 'refinedText',
  '#refinementStatus': 'refinementStatus',
}

function sameSource(
  item: ReturnType<typeof segmentFromItem>,
  input: TranscriptRevisionInput,
) {
  return (
    item.segmentId === input.segmentId &&
    item.revision === input.revision &&
    item.sourceText === input.sourceText &&
    item.isFinal === input.isFinal &&
    item.startMs === input.startMs &&
    item.endMs === input.endMs
  )
}

export function createSegmentOperations(
  dependencies: RepositoryDependencies,
): Omit<SessionStateRepository, 'getPreviousFinalSegments'> {
  async function getSession(
    sessionId: Parameters<SessionStateRepository['getSession']>[0],
  ): Promise<GetSessionResult> {
    try {
      const result = await readSessionItem(dependencies, sessionId)
      if (result.kind === 'not_found') return { kind: 'not_found' }
      if (result.kind === 'invalid') {
        return { kind: 'failed', error: invalidPersistedState() }
      }
      return { kind: 'found', value: sessionFromItem(result.item) }
    } catch {
      return { kind: 'failed', error: persistenceFailure() }
    }
  }

  async function getSegment(
    reference: Parameters<SessionStateRepository['getSegment']>[0],
  ): Promise<GetSegmentResult> {
    try {
      const result = await readSegmentItem(
        dependencies,
        reference.sessionId,
        reference.sequence,
      )
      if (result.kind === 'not_found') return { kind: 'not_found' }
      if (result.kind === 'invalid') {
        return { kind: 'failed', error: invalidPersistedState() }
      }
      return { kind: 'found', segment: segmentFromItem(result.item) }
    } catch {
      return { kind: 'failed', error: persistenceFailure() }
    }
  }

  async function acceptTranscriptRevision(
    input: TranscriptRevisionInput,
  ): Promise<AcceptTranscriptRevisionResult> {
    if (!SequenceSchema.safeParse(input.sequence).success) {
      return {
        kind: 'rejected',
        error: rejectedError(
          'INVALID_INPUT',
          'Sequence exceeds the ten-digit key range',
        ),
      }
    }
    const sessionResult = await getSession(input.sessionId)
    if (sessionResult.kind === 'failed') return sessionResult
    if (sessionResult.kind === 'not_found') {
      return {
        kind: 'rejected',
        error: rejectedError('SESSION_NOT_FOUND', 'Session does not exist'),
      }
    }
    try {
      await dependencies.client.send(
        new UpdateCommand({
          TableName: dependencies.tableName,
          Key: segmentKey(input.sessionId, input.sequence),
          ConditionExpression: ACCEPT_CONDITION,
          UpdateExpression: ACCEPT_UPDATE,
          ExpressionAttributeNames: {
            '#PK': 'PK',
            '#entityType': 'entityType',
            '#sessionId': 'sessionId',
            '#segmentId': 'segmentId',
            '#sequence': 'sequence',
            '#revision': 'revision',
            '#sourceText': 'sourceText',
            '#isFinal': 'isFinal',
            '#startMs': 'startMs',
            '#endMs': 'endMs',
            '#expiresAt': 'expiresAt',
            '#draftText': 'draftText',
            '#refinedText': 'refinedText',
            '#refinementStatus': 'refinementStatus',
          },
          ExpressionAttributeValues: {
            ':segmentType': 'SEGMENT',
            ':sessionId': input.sessionId,
            ':segmentId': input.segmentId,
            ':sequence': input.sequence,
            ':revision': input.revision,
            ':sourceText': input.sourceText,
            ':isFinal': input.isFinal,
            ':startMs': input.startMs,
            ':endMs': input.endMs,
            ':expiresAt': sessionResult.value.session.expiresAt,
          },
        }),
      )
      return { kind: 'accepted', revision: input.revision }
    } catch (error) {
      if (!isConditionalFailure(error)) {
        return { kind: 'failed', error: persistenceFailure() }
      }
      const current = await getSegment(input)
      if (current.kind === 'failed') return current
      if (current.kind === 'not_found') {
        return { kind: 'failed', error: persistenceFailure() }
      }
      if (current.segment.segmentId !== input.segmentId) {
        return {
          kind: 'rejected',
          error: rejectedError(
            'SEGMENT_CONFLICT',
            'Sequence belongs to another segment',
          ),
        }
      }
      if (current.segment.revision > input.revision) {
        return {
          kind: 'stale',
          submittedRevision: input.revision,
          currentRevision: current.segment.revision,
        }
      }
      if (sameSource(current.segment, input)) {
        return { kind: 'duplicate', segment: current.segment }
      }
      return {
        kind: 'rejected',
        error: rejectedError(
          'SEGMENT_CONFLICT',
          'Current revision has different source payload',
        ),
      }
    }
  }

  async function classifyCurrent(reference: SessionRevisionReference) {
    const current = await getSegment(reference)
    if (current.kind !== 'found') {
      return current
    }
    if (
      current.segment.segmentId !== reference.segmentId ||
      current.segment.revision !== reference.revision
    ) {
      return {
        kind: 'not_current' as const,
        attemptedRevision: reference.revision,
        currentRevision: current.segment.revision,
      }
    }
    return current
  }

  async function saveDraft(input: {
    reference: SessionRevisionReference
    isFinal: boolean
    draftText: string
  }): Promise<SaveDraftResult> {
    const { reference } = input
    try {
      const output = await dependencies.client.send(
        new UpdateCommand({
          TableName: dependencies.tableName,
          Key: segmentKey(reference.sessionId, reference.sequence),
          UpdateExpression: input.isFinal
            ? 'SET #draftText = :draftText, #refinementStatus = :pending'
            : 'SET #draftText = :draftText',
          ConditionExpression: CURRENT_DRAFT_CONDITION,
          ExpressionAttributeNames: {
            '#entityType': 'entityType',
            '#segmentId': 'segmentId',
            '#revision': 'revision',
            '#isFinal': 'isFinal',
            '#draftText': 'draftText',
            ...(input.isFinal
              ? { '#refinementStatus': 'refinementStatus' }
              : {}),
          },
          ExpressionAttributeValues: {
            ':segmentType': 'SEGMENT',
            ':segmentId': reference.segmentId,
            ':revision': reference.revision,
            ':isFinal': input.isFinal,
            ':draftText': input.draftText,
            ...(input.isFinal ? { ':pending': 'PENDING' } : {}),
          },
          ReturnValues: 'ALL_NEW',
        }),
      )
      const parsed = SegmentItemSchema.safeParse(output.Attributes)
      return parsed.success
        ? { kind: 'stored', segment: segmentFromItem(parsed.data) }
        : { kind: 'failed', error: invalidPersistedState() }
    } catch (error) {
      if (!isConditionalFailure(error)) {
        return { kind: 'failed', error: persistenceFailure() }
      }
      const current = await classifyCurrent(reference)
      if (current.kind === 'failed') return current
      if (current.kind === 'not_current') return current
      if (current.kind === 'not_found') {
        return {
          kind: 'not_current',
          attemptedRevision: reference.revision,
        }
      }
      if (
        current.segment.isFinal === input.isFinal &&
        current.segment.draftText !== undefined
      ) {
        return { kind: 'already_stored', segment: current.segment }
      }
      return {
        kind: 'not_current',
        attemptedRevision: reference.revision,
        currentRevision: current.segment.revision,
      }
    }
  }

  async function markRefinementQueued(
    reference: SessionRevisionReference,
  ): Promise<MarkRefinementQueuedResult> {
    try {
      await dependencies.client.send(
        new UpdateCommand({
          TableName: dependencies.tableName,
          Key: segmentKey(reference.sessionId, reference.sequence),
          UpdateExpression: 'SET #refinementStatus = :queued',
          ConditionExpression: PENDING_CONDITION,
          ExpressionAttributeNames: {
            '#entityType': 'entityType',
            '#segmentId': 'segmentId',
            '#revision': 'revision',
            '#isFinal': 'isFinal',
            '#draftText': 'draftText',
            '#refinementStatus': 'refinementStatus',
          },
          ExpressionAttributeValues: {
            ':segmentType': 'SEGMENT',
            ':segmentId': reference.segmentId,
            ':revision': reference.revision,
            ':true': true,
            ':pending': 'PENDING',
            ':queued': 'QUEUED',
          },
        }),
      )
      return { kind: 'queued' }
    } catch (error) {
      if (!isConditionalFailure(error)) {
        return { kind: 'failed', error: persistenceFailure() }
      }
      const current = await classifyCurrent(reference)
      if (current.kind === 'failed') return current
      if (current.kind === 'not_current') return current
      if (current.kind === 'not_found') {
        return {
          kind: 'not_current',
          attemptedRevision: reference.revision,
        }
      }
      if (current.segment.refinementStatus === 'QUEUED') {
        return { kind: 'already_queued' }
      }
      if (current.segment.refinementStatus === 'COMPLETED') {
        return { kind: 'already_completed' }
      }
      return current.segment.refinementStatus === undefined
        ? { kind: 'invalid_state' }
        : {
            kind: 'invalid_state',
            status: current.segment.refinementStatus,
          }
    }
  }

  async function saveRefined(input: {
    reference: SessionRevisionReference
    refinedText: string
  }): Promise<SaveRefinedResult> {
    const { reference } = input
    try {
      const output = await dependencies.client.send(
        new UpdateCommand({
          TableName: dependencies.tableName,
          Key: segmentKey(reference.sessionId, reference.sequence),
          UpdateExpression:
            'SET #refinedText = :refinedText, #refinementStatus = :completed',
          ConditionExpression: REFINABLE_CONDITION,
          ExpressionAttributeNames: STATE_NAMES,
          ExpressionAttributeValues: {
            ':segmentType': 'SEGMENT',
            ':segmentId': reference.segmentId,
            ':revision': reference.revision,
            ':true': true,
            ':pending': 'PENDING',
            ':queued': 'QUEUED',
            ':completed': 'COMPLETED',
            ':refinedText': input.refinedText,
          },
          ReturnValues: 'ALL_NEW',
        }),
      )
      const parsed = SegmentItemSchema.safeParse(output.Attributes)
      return parsed.success
        ? { kind: 'stored', segment: segmentFromItem(parsed.data) }
        : { kind: 'failed', error: invalidPersistedState() }
    } catch (error) {
      if (!isConditionalFailure(error)) {
        return { kind: 'failed', error: persistenceFailure() }
      }
      const current = await classifyCurrent(reference)
      if (current.kind === 'failed') return current
      if (current.kind === 'not_current') return current
      if (current.kind === 'not_found') {
        return {
          kind: 'not_current',
          attemptedRevision: reference.revision,
        }
      }
      if (
        current.segment.refinementStatus === 'COMPLETED' &&
        current.segment.refinedText !== undefined
      ) {
        return { kind: 'already_completed', segment: current.segment }
      }
      return current.segment.refinementStatus === undefined
        ? { kind: 'invalid_state' }
        : {
            kind: 'invalid_state',
            status: current.segment.refinementStatus,
          }
    }
  }

  return {
    getSession,
    acceptTranscriptRevision,
    getSegment,
    saveDraft,
    markRefinementQueued,
    saveRefined,
  }
}
