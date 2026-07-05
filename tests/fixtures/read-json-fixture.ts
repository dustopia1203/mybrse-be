import { readFileSync } from 'node:fs'

export const readJsonFixture = (
  fileName: string,
  directory = 'websocket',
): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`./${directory}/${fileName}`, import.meta.url),
      'utf8',
    ),
  )
