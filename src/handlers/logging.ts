export interface SafeLogFields {
  handler?: string
  routeKey?: string
  connectionId?: string
  requestId?: string
  messageId?: string
  sessionId?: string
  segmentId?: string
  sequence?: number
  revision?: number
  stage?: string
  outcome?: string
  errorCode?: string
  configurationField?: string
  provider?: string
  errorName?: string
}

type LogLevel = 'info' | 'warn' | 'error'

const SAFE_KEYS = new Set<keyof SafeLogFields>([
  'handler',
  'routeKey',
  'connectionId',
  'requestId',
  'messageId',
  'sessionId',
  'segmentId',
  'sequence',
  'revision',
  'stage',
  'outcome',
  'errorCode',
  'configurationField',
  'provider',
  'errorName',
])

function sanitized(fields: SafeLogFields): SafeLogFields {
  const output: SafeLogFields = {}
  for (const key of SAFE_KEYS) {
    const value = fields[key]
    if (value !== undefined) {
      Object.assign(output, { [key]: value })
    }
  }
  return output
}

function write(level: LogLevel, fields: SafeLogFields): void {
  console[level](JSON.stringify({ level, ...sanitized(fields) }))
}

export function logInfo(fields: SafeLogFields): void {
  write('info', fields)
}

export function logWarn(fields: SafeLogFields): void {
  write('warn', fields)
}

export function logError(fields: SafeLogFields): void {
  write('error', fields)
}
