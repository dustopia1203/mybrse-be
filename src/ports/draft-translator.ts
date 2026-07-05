import type { ApplicationError, LanguageCode } from '../domain'

export interface DraftTranslationInput {
  sourceText: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
}

export type DraftTranslationResult =
  | { kind: 'translated'; text: string }
  | { kind: 'failed'; error: ApplicationError }

export interface DraftTranslator {
  translate(input: DraftTranslationInput): Promise<DraftTranslationResult>
}
