import type { APIGatewayProxyResult } from 'aws-lambda'

export function jsonResponse(
  statusCode: number,
  body: Record<string, unknown> = {},
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function ok(body: Record<string, unknown> = {}): APIGatewayProxyResult {
  return jsonResponse(200, body)
}

export function badRequest(
  body: Record<string, unknown> = {},
): APIGatewayProxyResult {
  return jsonResponse(400, body)
}

export function serverError(
  body: Record<string, unknown> = {},
): APIGatewayProxyResult {
  return jsonResponse(500, body)
}
