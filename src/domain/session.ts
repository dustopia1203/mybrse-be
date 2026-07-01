import { z } from 'zod'

import {
  LanguageCodeSchema,
  SessionIdSchema,
  UnixTimeMillisecondsSchema,
  UnixTimeSecondsSchema,
} from './scalars'

export const SessionSchema = z.strictObject({
  sessionId: SessionIdSchema,
  sourceLanguage: LanguageCodeSchema,
  targetLanguage: LanguageCodeSchema,
  createdAtMs: UnixTimeMillisecondsSchema,
  expiresAt: UnixTimeSecondsSchema,
})

export type Session = z.infer<typeof SessionSchema>
