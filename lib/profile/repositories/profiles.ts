import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { investorProfiles } from '@/db/schema'
import type { InvestorProfile } from '@/db/schema'

export async function getProfileByUserId(userId: string): Promise<InvestorProfile | undefined> {
  const [row] = await db
    .select()
    .from(investorProfiles)
    .where(eq(investorProfiles.userId, userId))
    .limit(1)
  return row
}

export async function upsertProfile(
  userId: string,
  data: { investmentGoal?: string; strategyNotes?: string },
): Promise<InvestorProfile> {
  const [row] = await db
    .insert(investorProfiles)
    .values({ userId, ...data })
    .onConflictDoUpdate({
      target: investorProfiles.userId,
      set: data,
    })
    .returning()
  return row
}
