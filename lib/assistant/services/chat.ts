import { stepCountIs } from 'ai'
import { streamAssistantReply } from '@/lib/ai'
import type { ModelMessage } from '@/lib/ai'
import { getProfile } from '@/lib/profile'
import { buildTools } from '@/lib/assistant/tools'
import { buildSystemPrompt } from '@/lib/assistant/prompt'

const MAX_TOOL_STEPS = 6

export async function streamChat(
  userId: string,
  messages: ModelMessage[],
) {
  const profile = await getProfile(userId)
  const system = buildSystemPrompt(profile)
  const tools = buildTools(userId)
  return streamAssistantReply({
    system,
    messages,
    tools,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
  })
}
