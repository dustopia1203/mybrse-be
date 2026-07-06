import {
  TranslateTextCommand,
  type TranslateTextCommandOutput,
} from '@aws-sdk/client-translate'
import { describe, expect, it } from 'vitest'

import {
  AmazonTranslateDraftTranslator,
  type TranslateCommandSender,
} from '../../../../src/adapters/aws/translate'
import type { DraftTranslator } from '../../../../src/ports'

class ScriptedSender implements TranslateCommandSender {
  command?: TranslateTextCommand

  constructor(
    private readonly result: TranslateTextCommandOutput | unknown,
    private readonly throws = false,
  ) {}

  async send(
    command: TranslateTextCommand,
  ): Promise<TranslateTextCommandOutput> {
    this.command = command
    if (this.throws) throw this.result
    return this.result as TranslateTextCommandOutput
  }
}

describe('AmazonTranslateDraftTranslator', () => {
  it('maps the port input to TranslateTextCommand', async () => {
    const sender = new ScriptedSender({ TranslatedText: 'Xin chào' })
    const translator: DraftTranslator = new AmazonTranslateDraftTranslator(
      sender,
    )

    await expect(
      translator.translate({
        sourceText: 'こんにちは',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
      }),
    ).resolves.toEqual({ kind: 'translated', text: 'Xin chào' })
    expect(sender.command?.input).toEqual({
      Text: 'こんにちは',
      SourceLanguageCode: 'ja',
      TargetLanguageCode: 'vi',
    })
  })

  it('rejects a malformed provider response', async () => {
    const translator = new AmazonTranslateDraftTranslator(
      new ScriptedSender({}),
    )
    await expect(
      translator.translate({
        sourceText: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    })
  })

  it.each([
    ['TooManyRequestsException', 'PROVIDER_UNAVAILABLE'],
    ['UnsupportedLanguagePairException', 'PROVIDER_REJECTED'],
    ['AccessDeniedException', 'CONFIGURATION_ERROR'],
    ['UnknownException', 'INTERNAL_ERROR'],
  ])('maps %s to %s', async (name, code) => {
    const thrown =
      name === 'UnknownException'
        ? new Error('unknown')
        : { name, $metadata: { httpStatusCode: 400 } }
    const translator = new AmazonTranslateDraftTranslator(
      new ScriptedSender(thrown, true),
    )
    const result = await translator.translate({
      sourceText: 'hello',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    })
    expect(result).toMatchObject({ kind: 'failed', error: { code } })
  })
})
