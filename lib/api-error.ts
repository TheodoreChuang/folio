import * as Sentry from '@sentry/nextjs'
import { logger } from './logger'

export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  const message = err instanceof Error ? err.message : String(err)
  logger.error('unhandled error', { error: message, ...context })
  Sentry.captureException(err, { extra: context })
}

// Supabase StorageError exposes statusCode as a string (e.g. '409'), not .status
export function getStorageStatusCode(err: unknown): string | undefined {
  return (err as { statusCode?: string }).statusCode
}
