import {
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime'
import { describe, expect, it } from 'vitest'

import {
  BedrockTranslationRefiner,
  type BedrockCommandSender,
} from '../../../../src/adapters/aws/bedrock'
import type { TranslationRefiner } from '../../../../src/ports'

const INPUT = {
  sourceText: 'こんにちは',
  draftText: 'Xin chào',
  sourceLanguage: 'ja',
  targetLanguage: 'vi',
  context: [],
}

class ScriptedSender implements BedrockCommandSender {
  command?: ConverseCommand
  constructor(
    private readonly result: ConverseCommandOutput | unknown,
    private readonly throws = false,
  ) {}
  async send(command: ConverseCommand): Promise<ConverseCommandOutput> {
    this.command = command
    if (this.throws) throw this.result
    return this.result as ConverseCommandOutput
  }
}

describe('BedrockTranslationRefiner', () => {
  it('returns one trimmed assistant text block', async () => {
    const sender = new ScriptedSender({
      output: {
        message: { role: 'assistant', content: [{ text: ' Xin chào. ' }] },
      },
    })
    const refiner: TranslationRefiner = new BedrockTranslationRefiner(
      sender,
      'provider.model-v1',
    )
    await expect(refiner.refine(INPUT)).resolves.toEqual({
      kind: 'refined',
      text: 'Xin chào.',
    })
    expect(sender.command?.input.modelId).toBe('provider.model-v1')
  })

  it.each([
    {},
    { output: { message: { role: 'user', content: [{ text: 'text' }] } } },
    { output: { message: { role: 'assistant', content: [] } } },
    { output: { message: { role: 'assistant', content: [{ text: ' ' }] } } },
    {
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'one' }, { text: 'two' }],
        },
      },
    },
  ])('rejects malformed output %#', async (output) => {
    const refiner = new BedrockTranslationRefiner(
      new ScriptedSender(output),
      'provider.model-v1',
    )
    await expect(refiner.refine(INPUT)).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    })
  })

  it.each([
    ['ThrottlingException', 429, 'PROVIDER_UNAVAILABLE'],
    ['ValidationException', 400, 'PROVIDER_REJECTED'],
    ['AccessDeniedException', 403, 'CONFIGURATION_ERROR'],
  ])('maps %s to %s', async (name, httpStatusCode, code) => {
    const refiner = new BedrockTranslationRefiner(
      new ScriptedSender({ name, $metadata: { httpStatusCode } }, true),
      'provider.model-v1',
    )
    expect(await refiner.refine(INPUT)).toMatchObject({
      kind: 'failed',
      error: { code },
    })
  })
})
