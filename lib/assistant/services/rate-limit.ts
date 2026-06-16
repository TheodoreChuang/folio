import { getTodayUsage, atomicConsumeIfAllowed } from '@/lib/assistant/repositories/usage'

export const DAILY_MESSAGE_CAP = 25

// Fast UX read — NOT the admission gate. Shows current usage without consuming quota.
export async function checkAllowance(
  userId: string,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const today = new Date().toISOString().slice(0, 10)
  const used = (await getTodayUsage(userId, today)) ?? 0
  return { allowed: used < DAILY_MESSAGE_CAP, used, limit: DAILY_MESSAGE_CAP }
}

// Atomic admission gate — called at the model's first emitted token (U7).
export async function consumeIfAllowed(
  userId: string,
): Promise<{ admitted: boolean; used: number }> {
  const today = new Date().toISOString().slice(0, 10)
  return atomicConsumeIfAllowed(userId, today)
}
