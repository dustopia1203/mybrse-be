import {
  ApiGatewayManagementApiClient,
  type PostToConnectionCommand,
  type PostToConnectionCommandOutput,
} from '@aws-sdk/client-apigatewaymanagementapi'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import { TranslateClient } from '@aws-sdk/client-translate'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

import {
  AmazonTranslateDraftTranslator,
  ApiGatewaySubtitlePublisher,
  BedrockTranslationRefiner,
  createDynamoDbSessionRepository,
  SqsRefinementQueue,
} from '../adapters/aws'
import { createProcessTranscript } from '../application/draft'
import { createProcessRefinement } from '../application/refinement'
import {
  createDisconnectSession,
  createStartSession,
} from '../application/session'
import {
  WebSocketControlPublisher,
  type WebSocketControlCommandSender,
} from '../handlers/websocket-control-publisher'
import { loadBackendConfig, type BackendConfig } from './backend-config'

export interface BackendRuntime {
  startSession: ReturnType<typeof createStartSession>
  disconnectSession: ReturnType<typeof createDisconnectSession>
  processTranscript: ReturnType<typeof createProcessTranscript>
  processRefinement: ReturnType<typeof createProcessRefinement>
  controlPublisher: WebSocketControlPublisher
  resolveApiGatewaySender: (endpoint: string) => WebSocketControlCommandSender
}

export interface BackendRuntimeFactoryDependencies {
  nowMs?: () => number
  createDynamoDbClient?: () => DynamoDBClient
  createTranslateClient?: () => TranslateClient
  createBedrockClient?: () => BedrockRuntimeClient
  createSqsClient?: () => SQSClient
  createApiGatewaySender?: (endpoint: string) => WebSocketControlCommandSender
}

let cachedRuntime: BackendRuntime | undefined

const apiGatewaySenders = new Map<string, WebSocketControlCommandSender>()

function defaultApiGatewaySender(
  endpoint: string,
): WebSocketControlCommandSender {
  return new ApiGatewayManagementApiClient({ endpoint })
}

export function createBackendRuntime(
  config: BackendConfig,
  dependencies: BackendRuntimeFactoryDependencies = {},
): BackendRuntime {
  const dynamoClient =
    dependencies.createDynamoDbClient?.() ?? new DynamoDBClient({})
  const documentClient = DynamoDBDocumentClient.from(dynamoClient)
  const repository = createDynamoDbSessionRepository({
    client: documentClient,
    tableName: config.tableName,
  })

  const translateClient =
    dependencies.createTranslateClient?.() ?? new TranslateClient({})
  const bedrockClient =
    dependencies.createBedrockClient?.() ?? new BedrockRuntimeClient({})
  const sqsClient = dependencies.createSqsClient?.() ?? new SQSClient({})

  const resolveApiGatewaySender = (
    endpoint: string,
  ): WebSocketControlCommandSender => {
    const existing = apiGatewaySenders.get(endpoint)
    if (existing !== undefined) return existing
    const sender =
      dependencies.createApiGatewaySender?.(endpoint) ??
      defaultApiGatewaySender(endpoint)
    apiGatewaySenders.set(endpoint, sender)
    return sender
  }

  const translator = new AmazonTranslateDraftTranslator(translateClient)
  const refiner = new BedrockTranslationRefiner(
    bedrockClient,
    config.bedrockModelId,
  )
  const refinementQueue = new SqsRefinementQueue(
    sqsClient,
    config.refinementQueueUrl,
  )
  const publisher = new ApiGatewaySubtitlePublisher(resolveApiGatewaySender)
  const controlPublisher = new WebSocketControlPublisher(
    resolveApiGatewaySender,
  )

  return {
    startSession: createStartSession({
      repository,
      nowMs: dependencies.nowMs ?? (() => Date.now()),
      sessionRetentionSeconds: config.sessionRetentionSeconds,
    }),
    disconnectSession: createDisconnectSession({ repository }),
    processTranscript: createProcessTranscript({
      repository,
      translator,
      publisher,
      refinementQueue,
    }),
    processRefinement: createProcessRefinement({
      repository,
      refiner,
      publisher,
      contextLimit: config.contextWindowSize,
    }),
    controlPublisher,
    resolveApiGatewaySender,
  }
}

export function getBackendRuntime(
  env: Record<string, string | undefined> = process.env,
): BackendRuntime {
  cachedRuntime ??= createBackendRuntime(loadBackendConfig(env))
  return cachedRuntime
}

export function resetBackendRuntimeForTests(): void {
  cachedRuntime = undefined
  apiGatewaySenders.clear()
}
