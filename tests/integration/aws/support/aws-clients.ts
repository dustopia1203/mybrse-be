import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SQSClient } from '@aws-sdk/client-sqs'
import { TranslateClient } from '@aws-sdk/client-translate'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

import type { LiveAwsIntegrationConfig } from './integration-config'

export interface LiveAwsClients {
  dynamoDb: DynamoDBDocumentClient
  sqs: SQSClient
  translate: TranslateClient
  bedrock: BedrockRuntimeClient
}

export function createLiveAwsClients(
  config: LiveAwsIntegrationConfig,
): LiveAwsClients {
  const clientConfig = {
    region: config.region,
    credentials: config.credentials,
    maxAttempts: 2,
  }
  const dynamoDbClient = new DynamoDBClient(clientConfig)

  return {
    dynamoDb: DynamoDBDocumentClient.from(dynamoDbClient),
    sqs: new SQSClient(clientConfig),
    translate: new TranslateClient(clientConfig),
    bedrock: new BedrockRuntimeClient(clientConfig),
  }
}
