import { beforeAll, describe, expect, it } from 'vitest'

import { BedrockTranslationRefiner } from '../../../src/adapters/aws/bedrock/bedrock-translation-refiner'
import {
  createLiveAwsClients,
  type LiveAwsClients,
} from './support/aws-clients'
import {
  loadLiveAwsIntegrationConfig,
  type LiveAwsIntegrationConfig,
} from './support/integration-config'
import { createTestRunRegistry, registerSegmentId } from './support/test-run'

let config: LiveAwsIntegrationConfig | undefined
let clients: LiveAwsClients | undefined

beforeAll(() => {
  config = loadLiveAwsIntegrationConfig()
  clients = createLiveAwsClients(config)
})

describe('Bedrock translation refiner against live AWS', () => {
  it('refines a bounded Vietnamese draft translation', async () => {
    const registry = createTestRunRegistry()
    const result = await new BedrockTranslationRefiner(
      clients!.bedrock,
      config!.bedrockModelId,
    ).refine({
      sourceText: 'Good morning.',
      draftText: 'Chào buổi sáng.',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      context: [
        {
          segmentId: registerSegmentId(registry),
          sequence: 0,
          sourceText: 'Hello.',
          translatedText: 'Xin chào.',
          translationKind: 'draft',
        },
      ],
    })

    expect(result.kind).toBe('refined')
    if (result.kind !== 'refined') {
      throw new Error(`Bedrock integration failed with ${result.error.code}`)
    }
    expect(result.text.trim().length).toBeGreaterThan(0)
  })
})
