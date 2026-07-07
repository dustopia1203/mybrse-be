import { describe, expect, it } from 'vitest'

import { localStackAwsConfig, waitForLocalStack } from './localstack-fixtures'

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
})
