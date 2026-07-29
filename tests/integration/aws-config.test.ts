import { describe, expect, it } from 'vitest'

import {
  IntegrationConfigError,
  loadLiveAwsIntegrationConfig,
} from './aws/support/integration-config'

const COMPLETE_ENV = {
  AWS_REGION: 'ap-southeast-1',
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  AWS_INTEGRATION_TABLE_NAME: 'translation-state-test',
  AWS_INTEGRATION_REFINEMENT_QUEUE_URL:
    'https://sqs.ap-southeast-1.amazonaws.com/123456789012/refinement-test',
  AWS_INTEGRATION_BEDROCK_MODEL_ID: 'provider.model-v1',
}

describe('live AWS integration configuration', () => {
  it('returns explicit IAM User client configuration', () => {
    expect(loadLiveAwsIntegrationConfig(COMPLETE_ENV)).toEqual({
      region: 'ap-southeast-1',
      credentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
      },
      tableName: 'translation-state-test',
      refinementQueueUrl:
        'https://sqs.ap-southeast-1.amazonaws.com/123456789012/refinement-test',
      bedrockModelId: 'provider.model-v1',
    })
  })

  it('includes a non-empty optional session token', () => {
    expect(
      loadLiveAwsIntegrationConfig({
        ...COMPLETE_ENV,
        AWS_SESSION_TOKEN: 'test-session-token',
      }).credentials,
    ).toEqual({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      sessionToken: 'test-session-token',
    })
  })

  it('reports every missing or empty required variable without values', () => {
    const secret = 'must-not-appear'
    const read = () =>
      loadLiveAwsIntegrationConfig({
        AWS_ACCESS_KEY_ID: secret,
        AWS_SECRET_ACCESS_KEY: '   ',
      })
    expect(read).toThrow(IntegrationConfigError)
    try {
      read()
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationConfigError)
      expect((error as IntegrationConfigError).variableNames).toEqual([
        'AWS_REGION',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_INTEGRATION_TABLE_NAME',
        'AWS_INTEGRATION_REFINEMENT_QUEUE_URL',
        'AWS_INTEGRATION_BEDROCK_MODEL_ID',
      ])
      expect((error as Error).message).not.toContain(secret)
    }
  })
})
