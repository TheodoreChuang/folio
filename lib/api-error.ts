import * as Sentry from '@sentry/nextjs'
import { logger } from './logger'

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  const message = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined
  logger.error('unhandled error', { error: message, cause, ...context })
  Sentry.captureException(err, { extra: context })
}

// Supabase StorageError exposes statusCode as a string (e.g. '409'), not .status
export function getStorageStatusCode(err: unknown): string | undefined {
  return (err as { statusCode?: string }).statusCode
}
