import { afterEach, describe, expect, it, vi } from 'vitest'

import { logError, logInfo, logWarn } from '../../src/handlers/logging'

describe('safe structured logging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits JSON through the selected console method', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    logInfo({ handler: 'ingress', routeKey: 'session.start', outcome: 'ok' })
    expect(JSON.parse(spy.mock.calls[0]?.[0] as string)).toEqual({
      level: 'info',
      handler: 'ingress',
      routeKey: 'session.start',
      outcome: 'ok',
    })
  })

  it('drops unsafe fields before logging', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    logWarn({
      handler: 'refine',
      sourceText: 'secret transcript',
      body: '{"raw":"payload"}',
      errorCode: 'INVALID_INPUT',
    } as never)
    const logged = JSON.parse(spy.mock.calls[0]?.[0] as string)
    expect(logged).toMatchObject({
      level: 'warn',
      handler: 'refine',
      errorCode: 'INVALID_INPUT',
    })
    expect(logged).not.toHaveProperty('sourceText')
    expect(logged).not.toHaveProperty('body')
  })

  it('supports error logs without stack traces', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logError({ handler: 'ingress', errorName: 'TypeError' })
    expect(JSON.parse(spy.mock.calls[0]?.[0] as string)).toEqual({
      level: 'error',
      handler: 'ingress',
      errorName: 'TypeError',
    })
  })
})
