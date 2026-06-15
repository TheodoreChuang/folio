import { streamText } from 'ai'
import type { ModelMessage, ToolSet, StopCondition } from 'ai'
import { getModel } from './provider'

export type { ModelMessage }

export interface StreamAssistantReplyOptions<TOOLS extends ToolSet> {
  system: string
  messages: ModelMessage[]
  tools?: TOOLS
  stopWhen?: StopCondition<TOOLS> | Array<StopCondition<TOOLS>>
}

const MODEL_FALLBACKS = ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini']

export function streamAssistantReply<TOOLS extends ToolSet>(
  options: StreamAssistantReplyOptions<TOOLS>,
) {
  return streamText({
    model: getModel(),
    system: options.system,
    messages: options.messages,
    tools: options.tools,
    stopWhen: options.stopWhen,
    providerOptions: {
      gateway: { models: MODEL_FALLBACKS },
    },
  })
}
