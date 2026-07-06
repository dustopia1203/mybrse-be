import {
  TranslateTextCommand,
  type TranslateTextCommandOutput,
} from '@aws-sdk/client-translate'

import type {
  DraftTranslationInput,
  DraftTranslationResult,
  DraftTranslator,
} from '../../../ports'
import {
  internalAdapterFailure,
  providerFailure,
  type ProviderErrorPolicy,
} from '../errors'

export interface TranslateCommandSender {
  send(command: TranslateTextCommand): Promise<TranslateTextCommandOutput>
}

const ERROR_POLICY: ProviderErrorPolicy = {
  transientNames: new Set([
    'TooManyRequestsException',
    'InternalServerException',
    'ServiceUnavailableException',
    'TimeoutError',
  ]),
  rejectedNames: new Set([
    'DetectedLanguageLowConfidenceException',
    'InvalidRequestException',
    'TextSizeLimitExceededException',
    'UnsupportedLanguagePairException',
  ]),
  configurationNames: new Set([
    'AccessDeniedException',
    'UnrecognizedClientException',
    'InvalidSignatureException',
    'ExpiredTokenException',
  ]),
}

export class AmazonTranslateDraftTranslator implements DraftTranslator {
  constructor(private readonly sender: TranslateCommandSender) {}

  async translate(
    input: DraftTranslationInput,
  ): Promise<DraftTranslationResult> {
    try {
      const output = await this.sender.send(
        new TranslateTextCommand({
          Text: input.sourceText,
          SourceLanguageCode: input.sourceLanguage,
          TargetLanguageCode: input.targetLanguage,
        }),
      )
      if (typeof output.TranslatedText !== 'string') {
        return { kind: 'failed', error: internalAdapterFailure() }
      }
      return { kind: 'translated', text: output.TranslatedText }
    } catch (error) {
      return { kind: 'failed', error: providerFailure(error, ERROR_POLICY) }
    }
  }
}
