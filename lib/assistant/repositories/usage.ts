import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { assistantUsage } from '@/db/schema'

export async function getTodayUsage(userId: string, today: string): Promise<number | undefined> {
  const [row] = await db
    .select({ messageCount: assistantUsage.messageCount })
    .from(assistantUsage)
    .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.usageDate, today)))
    .limit(1)
  return row?.messageCount
}

export async function atomicConsumeIfAllowed(
  userId: string,
  today: string,
): Promise<{ admitted: boolean; used: number }> {
  // LEAST(count + 1, 26) sentinel: at cap=25 increments to 26 so (26 <= 25) = false.
  // A CASE WHEN keeps count at 25, making (25 <= 25) = true and admitting the 26th request.
  const rows = await db.execute<{ message_count: number; admitted: boolean }>(sql`
    INSERT INTO assistant_usage (user_id, usage_date, message_count)
    VALUES (${userId}, ${today}, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE
      SET message_count = LEAST(assistant_usage.message_count + 1, 26)
    RETURNING message_count, (message_count <= 25) AS admitted
  `)
  const row = rows[0]
  return { admitted: row.admitted, used: row.message_count }
}
