import type {
  DraftTranslationInput,
  DraftTranslationResult,
  DraftTranslator,
} from '../../src/ports'

export class FakeDraftTranslator implements DraftTranslator {
  readonly inputs: DraftTranslationInput[] = []
  constructor(
    private readonly callLog: string[],
    public result: DraftTranslationResult = {
      kind: 'translated',
      text: 'Xin chào',
    },
  ) {}
  async translate(
    input: DraftTranslationInput,
  ): Promise<DraftTranslationResult> {
    this.callLog.push('translate')
    this.inputs.push(input)
    return this.result
  }
}
