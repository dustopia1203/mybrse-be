import { QueryCommand, type QueryCommandInput } from '@aws-sdk/lib-dynamodb'

import { SequenceSchema, type TranslationContextEntry } from '../../../domain'
import type {
  GetPreviousFinalSegmentsResult,
  SessionStateRepository,
} from '../../../ports'
import type { RepositoryDependencies } from './client'
import {
  invalidPersistedState,
  persistenceFailure,
  rejectedError,
} from './errors'
import { SegmentItemSchema } from './items'
import { firstSegmentKey, previousSegmentKey } from './keys'

export function createContextOperations(
  dependencies: RepositoryDependencies,
): Pick<SessionStateRepository, 'getPreviousFinalSegments'> {
  async function getPreviousFinalSegments(
    input: Parameters<SessionStateRepository['getPreviousFinalSegments']>[0],
  ): Promise<GetPreviousFinalSegmentsResult> {
    if (
      !SequenceSchema.safeParse(input.beforeSequence).success ||
      !Number.isSafeInteger(input.limit) ||
      input.limit <= 0
    ) {
      return {
        kind: 'rejected',
        error: rejectedError(
          'INVALID_INPUT',
          'Context sequence and limit are outside their supported ranges',
        ),
      }
    }
    if (input.beforeSequence === 0) {
      return { kind: 'loaded', context: [] }
    }

    const descending: TranslationContextEntry[] = []
    let exclusiveStartKey: Record<string, unknown> | undefined
    try {
      do {
        const query: QueryCommandInput = {
          TableName: dependencies.tableName,
          KeyConditionExpression:
            '#PK = :PK AND #SK BETWEEN :firstSegment AND :lastSegment',
          FilterExpression:
            '#entityType = :segmentType AND #isFinal = :true AND attribute_exists(#draftText)',
          ExpressionAttributeNames: {
            '#PK': 'PK',
            '#SK': 'SK',
            '#entityType': 'entityType',
            '#isFinal': 'isFinal',
            '#draftText': 'draftText',
          },
          ExpressionAttributeValues: {
            ':PK': `SESSION#${input.sessionId}`,
            ':firstSegment': firstSegmentKey(),
            ':lastSegment': previousSegmentKey(input.beforeSequence),
            ':segmentType': 'SEGMENT',
            ':true': true,
          },
          ConsistentRead: true,
          ScanIndexForward: false,
          Limit: input.limit - descending.length,
          ...(exclusiveStartKey === undefined
            ? {}
            : { ExclusiveStartKey: exclusiveStartKey }),
        }
        const output = await dependencies.client.send(new QueryCommand(query))
        for (const rawItem of output.Items ?? []) {
          const parsed = SegmentItemSchema.safeParse(rawItem)
          if (!parsed.success || parsed.data.draftText === undefined) {
            return { kind: 'failed', error: invalidPersistedState() }
          }
          descending.push({
            segmentId: parsed.data.segmentId,
            sequence: parsed.data.sequence,
            sourceText: parsed.data.sourceText,
            translatedText: parsed.data.refinedText ?? parsed.data.draftText,
            translationKind:
              parsed.data.refinedText === undefined ? 'draft' : 'refined',
          })
          if (descending.length === input.limit) break
        }
        exclusiveStartKey = output.LastEvaluatedKey
      } while (
        descending.length < input.limit &&
        exclusiveStartKey !== undefined
      )
      return { kind: 'loaded', context: descending.reverse() }
    } catch {
      return { kind: 'failed', error: persistenceFailure() }
    }
  }

  return { getPreviousFinalSegments }
}
