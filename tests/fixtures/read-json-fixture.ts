import { readFileSync } from 'node:fs'

export const readJsonFixture = (fileName: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`./websocket/${fileName}`, import.meta.url), 'utf8'),
  )
