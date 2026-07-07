import { describe, expect, it } from 'vitest'

import {
  badRequest,
  jsonResponse,
  ok,
  serverError,
} from '../../src/handlers/responses'

describe('handler responses', () => {
  it('returns JSON API Gateway responses', () => {
    expect(jsonResponse(202, { accepted: true })).toEqual({
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepted: true }),
    })
  })

  it('provides common status helpers', () => {
    expect(ok().statusCode).toBe(200)
    expect(badRequest().statusCode).toBe(400)
    expect(serverError().statusCode).toBe(500)
  })
})
