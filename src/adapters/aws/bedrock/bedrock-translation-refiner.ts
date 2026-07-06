import {
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime'

import type {
  RefinementInput,
  RefinementResult,
  TranslationRefiner,
} from '../../../ports'
import {
  internalAdapterFailure,
  providerFailure,
  type ProviderErrorPolicy,
} from '../errors'
import { buildConverseInput } from './prompt'

export interface BedrockCommandSender {
  send(command: ConverseCommand): Promise<ConverseCommandOutput>
}

const ERROR_POLICY: ProviderErrorPolicy = {
  transientNames: new Set([
    'ThrottlingException',
    'ServiceUnavailableException',
    'InternalServerException',
    'ModelTimeoutException',
    'ModelNotReadyException',
    'TimeoutError',
  ]),
  rejectedNames: new Set([
    'ValidationException',
    'ModelErrorException',
    'ModelStreamErrorException',
  ]),
  configurationNames: new Set([
    'AccessDeniedException',
    'ResourceNotFoundException',
    'UnrecognizedClientException',
    'InvalidSignatureException',
    'ExpiredTokenException',
  ]),
}

function refinedText(output: ConverseCommandOutput): string | undefined {
  const message = output.output?.message
  if (message?.role !== 'assistant' || message.content?.length !== 1) {
    return undefined
  }
  const block = message.content[0]
  const text =
    block !== undefined && 'text' in block ? block.text.trim() : undefined
  return text === '' ? undefined : text
}

export class BedrockTranslationRefiner implements TranslationRefiner {
  constructor(
    private readonly sender: BedrockCommandSender,
    private readonly modelId: string,
  ) {}

  async refine(input: RefinementInput): Promise<RefinementResult> {
    try {
      const output = await this.sender.send(
        new ConverseCommand(buildConverseInput(input, this.modelId)),
      )
      const text = refinedText(output)
      return text === undefined
        ? { kind: 'failed', error: internalAdapterFailure() }
        : { kind: 'refined', text }
    } catch (error) {
      return { kind: 'failed', error: providerFailure(error, ERROR_POLICY) }
    }
  }
}
