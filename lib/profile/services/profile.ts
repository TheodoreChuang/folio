import { getProfileByUserId, upsertProfile as upsertProfileRepo } from '../repositories/profiles'
import type { InvestorProfile } from '@/db/schema'

export async function getProfile(userId: string): Promise<InvestorProfile | null> {
  return (await getProfileByUserId(userId)) ?? null
}

export async function upsertProfile(
  userId: string,
  fields: { investmentGoal?: string; strategyNotes?: string },
): Promise<InvestorProfile> {
  return upsertProfileRepo(userId, fields)
}
