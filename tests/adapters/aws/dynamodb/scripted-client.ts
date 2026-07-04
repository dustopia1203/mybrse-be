import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

type ScriptStep =
  unknown | Error | ((command: unknown) => unknown | Promise<unknown>)

export function scriptedClient(...steps: ScriptStep[]) {
  const commands: unknown[] = []
  let index = 0
  const send = async (command: unknown): Promise<unknown> => {
    commands.push(command)
    const step = steps[index++]
    if (step === undefined) {
      throw new Error(`Missing scripted response for command ${index}`)
    }
    if (step instanceof Error) {
      throw step
    }
    return typeof step === 'function' ? step(command) : step
  }
  return {
    client: { send } as unknown as DynamoDBDocumentClient,
    commands,
    assertConsumed() {
      if (index !== steps.length) {
        throw new Error(`Consumed ${index} of ${steps.length} responses`)
      }
    },
  }
}

export function awsError(name: string): Error {
  return Object.assign(new Error(name), { name })
}
