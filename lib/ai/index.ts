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

export function streamAssistantReply<TOOLS extends ToolSet>(
  options: StreamAssistantReplyOptions<TOOLS>,
) {
  return streamText({
    model: getModel(),
    system: options.system,
    messages: options.messages,
    tools: options.tools,
    stopWhen: options.stopWhen,
  })
}
