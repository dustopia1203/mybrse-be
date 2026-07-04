import { UpdateCommand } from '@aws-sdk/lib-dynamodb'

import { SequenceSchema } from '../../../domain'
import type {
  AcceptTranscriptRevisionResult,
  GetSegmentResult,
  GetSessionResult,
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
import { segmentFromItem, sessionFromItem } from './items'
import { segmentKey } from './keys'

const ACCEPT_CONDITION =
  'attribute_not_exists(#PK) OR (#entityType = :segmentType AND #segmentId = :segmentId AND #revision < :revision)'
const ACCEPT_UPDATE =
  'SET #entityType = :segmentType, #sessionId = :sessionId, #segmentId = :segmentId, #sequence = :sequence, #revision = :revision, #sourceText = :sourceText, #isFinal = :isFinal, #startMs = :startMs, #endMs = :endMs, #expiresAt = :expiresAt REMOVE #draftText, #refinedText, #refinementStatus'

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

export function createTranscriptOperations(
  dependencies: RepositoryDependencies,
): Pick<
  SessionStateRepository,
  'getSession' | 'acceptTranscriptRevision' | 'getSegment'
> {
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

  return {
    getSession,
    acceptTranscriptRevision,
    getSegment,
  }
}
