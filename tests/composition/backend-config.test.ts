import { describe, expect, it } from 'vitest'

import { BackendConfigSchema } from '../../src/composition/backend-config'

const requiredConfig = {
  tableName: 'translation-state',
  refinementQueueUrl:
    'https://sqs.ap-southeast-1.amazonaws.com/123456789012/refinement',
  draftProvider: 'amazon-translate',
  refinerProvider: 'amazon-bedrock',
  bedrockModelId: 'provider.model-v1',
}

describe('BackendConfigSchema', () => {
  it('applies defaults when optional settings are missing', () => {
    expect(BackendConfigSchema.parse(requiredConfig)).toEqual({
      ...requiredConfig,
      contextWindowSize: 5,
      sessionRetentionSeconds: 86_400,
    })
  })

  it('accepts explicit context and retention settings', () => {
    expect(
      BackendConfigSchema.parse({
        ...requiredConfig,
        contextWindowSize: 8,
        sessionRetentionSeconds: 3_600,
      }),
    ).toEqual({
      ...requiredConfig,
      contextWindowSize: 8,
      sessionRetentionSeconds: 3_600,
    })
  })

  it.each([
    ['a blank table name', { ...requiredConfig, tableName: ' ' }],
    [
      'an invalid refinement queue URL',
      { ...requiredConfig, refinementQueueUrl: 'queue' },
    ],
    ['a zero context window', { ...requiredConfig, contextWindowSize: 0 }],
    [
      'a fractional context window',
      { ...requiredConfig, contextWindowSize: 1.5 },
    ],
    [
      'a retention beyond the safe integer range',
      {
        ...requiredConfig,
        sessionRetentionSeconds: Number.MAX_SAFE_INTEGER + 1,
      },
    ],
    ['a blank draft provider', { ...requiredConfig, draftProvider: ' ' }],
    ['a blank model ID', { ...requiredConfig, bedrockModelId: ' ' }],
    ['a string context window', { ...requiredConfig, contextWindowSize: '5' }],
  ])('rejects %s', (_description, rawConfig) => {
    expect(() => BackendConfigSchema.parse(rawConfig)).toThrow()
  })

  it.each([
    [
      'an unknown draft provider',
      { ...requiredConfig, draftProvider: 'other-translator' },
    ],
    [
      'an unknown refiner provider',
      { ...requiredConfig, refinerProvider: 'other-refiner' },
    ],
  ])('rejects %s', (_description, rawConfig) => {
    expect(() => BackendConfigSchema.parse(rawConfig)).toThrow()
  })

  it('rejects raw environment keys', () => {
    expect(() =>
      BackendConfigSchema.parse({
        ...requiredConfig,
        TABLE_NAME: 'translation-state',
      }),
    ).toThrow()
  })
})
