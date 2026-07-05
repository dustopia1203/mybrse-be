import type {
  ApplicationError,
  LanguageCode,
  TranslationContext,
} from '../domain'

export interface RefinementInput {
  sourceText: string
  draftText: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  context: TranslationContext
}

export type RefinementResult =
  | { kind: 'refined'; text: string }
  | { kind: 'failed'; error: ApplicationError }

export interface TranslationRefiner {
  refine(input: RefinementInput): Promise<RefinementResult>
}
