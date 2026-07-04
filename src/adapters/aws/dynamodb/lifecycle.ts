import {
  DeleteCommand,
  GetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb'
import type {
  DetachByConnectionIdResult,
  SessionLifecycleRepository,
  StartOrReattachSessionInput,
  StartOrReattachSessionResult,
} from '../../../ports'
import { readSessionItem, type RepositoryDependencies } from './client'
import {
  invalidPersistedState,
  isConditionalFailure,
  persistenceFailure,
} from './errors'
import { ConnectionItemSchema, connectionItem, sessionItem } from './items'
import { connectionKey, sessionKey } from './keys'

const NEW_SESSION_CONDITION = 'attribute_not_exists(#PK)'
const SAME_MAPPING_CONDITION =
  'attribute_not_exists(#PK) OR #sessionId = :sessionId'
const MATCHING_CONNECTION_CONDITION =
  '#entityType = :sessionType AND #sourceLanguage = :sourceLanguage AND #targetLanguage = :targetLanguage AND #connectionId = :oldConnectionId'
const DETACH_SESSION_CONDITION =
  '#entityType = :sessionType AND #connectionId = :connectionId'
const LOOKUP_SESSION_CONDITION = '#sessionId = :sessionId'

export function createLifecycleOperations(
  dependencies: RepositoryDependencies,
): Pick<
  SessionLifecycleRepository,
  'startOrReattach' | 'detachByConnectionId'
> {
  async function startOrReattach(
    input: StartOrReattachSessionInput,
  ): Promise<StartOrReattachSessionResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const current = await readSessionItem(
          dependencies,
          input.session.sessionId,
        )
        if (current.kind === 'invalid') {
          return { kind: 'failed', error: invalidPersistedState() }
        }
        if (current.kind === 'not_found') {
          await dependencies.client.send(
            new TransactWriteCommand({
              TransactItems: [
                {
                  Put: {
                    TableName: dependencies.tableName,
                    Item: sessionItem(input.session, input.connection),
                    ConditionExpression: NEW_SESSION_CONDITION,
                    ExpressionAttributeNames: { '#PK': 'PK' },
                  },
                },
                {
                  Put: {
                    TableName: dependencies.tableName,
                    Item: connectionItem(
                      input.connection.connectionId,
                      input.session.sessionId,
                      input.session.expiresAt,
                    ),
                    ConditionExpression: SAME_MAPPING_CONDITION,
                    ExpressionAttributeNames: {
                      '#PK': 'PK',
                      '#sessionId': 'sessionId',
                    },
                    ExpressionAttributeValues: {
                      ':sessionId': input.session.sessionId,
                    },
                  },
                },
              ],
            }),
          )
          return { kind: 'created' }
        }

        const stored = current.item
        if (
          stored.sourceLanguage !== input.session.sourceLanguage ||
          stored.targetLanguage !== input.session.targetLanguage
        ) {
          return { kind: 'language_conflict' }
        }

        const oldConnectionId = stored.connectionId
        const transactItems: TransactWriteCommandInput['TransactItems'] = [
          {
            Update: {
              TableName: dependencies.tableName,
              Key: sessionKey(input.session.sessionId),
              UpdateExpression:
                'SET #connectionId = :connectionId, #callbackEndpoint = :callbackEndpoint',
              ConditionExpression:
                oldConnectionId === undefined
                  ? '#entityType = :sessionType AND #sourceLanguage = :sourceLanguage AND #targetLanguage = :targetLanguage AND attribute_not_exists(#connectionId)'
                  : MATCHING_CONNECTION_CONDITION,
              ExpressionAttributeNames: {
                '#entityType': 'entityType',
                '#sourceLanguage': 'sourceLanguage',
                '#targetLanguage': 'targetLanguage',
                '#connectionId': 'connectionId',
                '#callbackEndpoint': 'callbackEndpoint',
              },
              ExpressionAttributeValues: {
                ':sessionType': 'SESSION',
                ':sourceLanguage': input.session.sourceLanguage,
                ':targetLanguage': input.session.targetLanguage,
                ':connectionId': input.connection.connectionId,
                ':callbackEndpoint': input.connection.callbackEndpoint,
                ...(oldConnectionId === undefined
                  ? {}
                  : { ':oldConnectionId': oldConnectionId }),
              },
            },
          },
          {
            Put: {
              TableName: dependencies.tableName,
              Item: connectionItem(
                input.connection.connectionId,
                input.session.sessionId,
                stored.expiresAt,
              ),
              ConditionExpression: SAME_MAPPING_CONDITION,
              ExpressionAttributeNames: {
                '#PK': 'PK',
                '#sessionId': 'sessionId',
              },
              ExpressionAttributeValues: {
                ':sessionId': input.session.sessionId,
              },
            },
          },
        ]
        if (
          oldConnectionId !== undefined &&
          oldConnectionId !== input.connection.connectionId
        ) {
          transactItems.push({
            Delete: {
              TableName: dependencies.tableName,
              Key: connectionKey(oldConnectionId),
              ConditionExpression: SAME_MAPPING_CONDITION,
              ExpressionAttributeNames: {
                '#PK': 'PK',
                '#sessionId': 'sessionId',
              },
              ExpressionAttributeValues: {
                ':sessionId': input.session.sessionId,
              },
            },
          })
        }
        await dependencies.client.send(
          new TransactWriteCommand({ TransactItems: transactItems }),
        )
        return { kind: 'reattached' }
      } catch (error) {
        if (isConditionalFailure(error) && attempt < 2) {
          continue
        }
        return { kind: 'failed', error: persistenceFailure() }
      }
    }
    return { kind: 'failed', error: persistenceFailure() }
  }

  async function detachByConnectionId(
    connectionId: string,
  ): Promise<DetachByConnectionIdResult> {
    try {
      const lookupOutput = await dependencies.client.send(
        new GetCommand({
          TableName: dependencies.tableName,
          Key: connectionKey(connectionId),
          ConsistentRead: true,
        }),
      )
      if (lookupOutput.Item === undefined) {
        return { kind: 'not_found' }
      }
      const lookup = ConnectionItemSchema.safeParse(lookupOutput.Item)
      if (!lookup.success) {
        return { kind: 'failed', error: invalidPersistedState() }
      }

      try {
        await dependencies.client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName: dependencies.tableName,
                  Key: connectionKey(connectionId),
                  ConditionExpression: LOOKUP_SESSION_CONDITION,
                  ExpressionAttributeNames: { '#sessionId': 'sessionId' },
                  ExpressionAttributeValues: {
                    ':sessionId': lookup.data.sessionId,
                  },
                },
              },
              {
                Update: {
                  TableName: dependencies.tableName,
                  Key: sessionKey(lookup.data.sessionId),
                  UpdateExpression: 'REMOVE #connectionId, #callbackEndpoint',
                  ConditionExpression: DETACH_SESSION_CONDITION,
                  ExpressionAttributeNames: {
                    '#entityType': 'entityType',
                    '#connectionId': 'connectionId',
                    '#callbackEndpoint': 'callbackEndpoint',
                  },
                  ExpressionAttributeValues: {
                    ':sessionType': 'SESSION',
                    ':connectionId': connectionId,
                  },
                },
              },
            ],
          }),
        )
        return { kind: 'detached' }
      } catch (error) {
        if (!isConditionalFailure(error)) {
          return { kind: 'failed', error: persistenceFailure() }
        }
        const current = await readSessionItem(
          dependencies,
          lookup.data.sessionId,
        )
        await dependencies.client
          .send(
            new DeleteCommand({
              TableName: dependencies.tableName,
              Key: connectionKey(connectionId),
              ConditionExpression: LOOKUP_SESSION_CONDITION,
              ExpressionAttributeNames: { '#sessionId': 'sessionId' },
              ExpressionAttributeValues: {
                ':sessionId': lookup.data.sessionId,
              },
            }),
          )
          .catch((cleanupError: unknown) => {
            if (!isConditionalFailure(cleanupError)) {
              throw cleanupError
            }
          })
        if (current.kind === 'invalid') {
          return { kind: 'failed', error: invalidPersistedState() }
        }
        if (current.kind === 'not_found') {
          return { kind: 'not_found' }
        }
        return current.item.connectionId === connectionId
          ? { kind: 'failed', error: persistenceFailure() }
          : { kind: 'superseded' }
      }
    } catch {
      return { kind: 'failed', error: persistenceFailure() }
    }
  }

  return { startOrReattach, detachByConnectionId }
}
