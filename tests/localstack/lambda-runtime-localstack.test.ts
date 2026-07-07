import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb'
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
import { TranslateClient } from '@aws-sdk/client-translate'
import { describe, expect, it } from 'vitest'

import { createBackendRuntime } from '../../src/composition/runtime'
import { localStackAwsConfig, waitForLocalStack } from './localstack-fixtures'

const sessionId = '0192f3a0-7b5c-7c8d-8e9f-0123456789ab'

describe('LocalStack test harness', () => {
  it('uses explicit local AWS endpoint and test credentials', () => {
    expect(localStackAwsConfig()).toEqual({
      endpoint: 'http://localhost:4566',
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    })
  })

  it('fails clearly when LocalStack is not reachable', async () => {
    await expect(waitForLocalStack('http://127.0.0.1:1')).rejects.toThrow(
      'LocalStack is not reachable',
    )
  })

  it('starts a session through runtime composition against LocalStack DynamoDB', async () => {
    await waitForLocalStack()

    const awsConfig = localStackAwsConfig()
    const dynamo = new DynamoDBClient(awsConfig)
    const sqs = new SQSClient(awsConfig)
    const tableName = `translation-state-${Date.now()}`
    const queueName = `refinement-${Date.now()}`

    const queue = await sqs.send(
      new CreateQueueCommand({ QueueName: queueName }),
    )

    await dynamo.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
      }),
    )
    await waitUntilTableExists(
      { client: dynamo, maxWaitTime: 20, minDelay: 1 },
      { TableName: tableName },
    )

    try {
      const runtime = createBackendRuntime(
        {
          tableName,
          refinementQueueUrl: queue.QueueUrl!,
          contextWindowSize: 5,
          draftProvider: 'amazon-translate',
          refinerProvider: 'amazon-bedrock',
          bedrockModelId: 'provider.model-v1',
          sessionRetentionSeconds: 86_400,
        },
        {
          nowMs: () => 1_700_000_000_000,
          createDynamoDbClient: () => dynamo,
          createSqsClient: () => sqs,
          createTranslateClient: () => new TranslateClient(awsConfig),
          createBedrockClient: () => new BedrockRuntimeClient(awsConfig),
          createApiGatewaySender: () => ({
            send: async () => ({ $metadata: {} }),
          }),
        },
      )

      await expect(
        runtime.startSession({
          sessionId,
          sourceLanguage: 'ja',
          targetLanguage: 'vi',
          connection: {
            connectionId: 'connection-localstack',
            callbackEndpoint: 'https://example.com/prod',
          },
        }),
      ).resolves.toEqual({ kind: 'started', sessionId })
    } finally {
      if (queue.QueueUrl !== undefined) {
        await sqs.send(new DeleteQueueCommand({ QueueUrl: queue.QueueUrl }))
      }
      await dynamo.send(new DeleteTableCommand({ TableName: tableName }))
    }
  }, 30_000)
})
