import type {
  RefinementInput,
  RefinementResult,
  TranslationRefiner,
} from '../../src/ports'

export class FakeTranslationRefiner implements TranslationRefiner {
  readonly inputs: RefinementInput[] = []

  constructor(
    private readonly callLog: string[],
    public result: RefinementResult = {
      kind: 'refined',
      text: 'Xin chào.',
    },
  ) {}

  async refine(input: RefinementInput): Promise<RefinementResult> {
    this.callLog.push('refine')
    this.inputs.push(input)
    return this.result
  }
}
