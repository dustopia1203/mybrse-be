import { beforeAll, describe, expect, it } from 'vitest'

import { AmazonTranslateDraftTranslator } from '../../../src/adapters/aws/translate/amazon-translate-draft-translator'
import {
  createLiveAwsClients,
  type LiveAwsClients,
} from './support/aws-clients'
import {
  loadLiveAwsIntegrationConfig,
  type LiveAwsIntegrationConfig,
} from './support/integration-config'

let config: LiveAwsIntegrationConfig | undefined
let clients: LiveAwsClients | undefined

beforeAll(() => {
  config = loadLiveAwsIntegrationConfig()
  clients = createLiveAwsClients(config)
})

describe('Amazon Translate against live AWS', () => {
  it('translates a bounded English source into Vietnamese', async () => {
    const result = await new AmazonTranslateDraftTranslator(
      clients!.translate,
    ).translate({
      sourceText: 'Good morning.',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    })

    expect(result.kind).toBe('translated')
    if (result.kind !== 'translated') {
      throw new Error(`Translate integration failed with ${result.error.code}`)
    }
    expect(result.text.trim().length).toBeGreaterThan(0)
  })
})
