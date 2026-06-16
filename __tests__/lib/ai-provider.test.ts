import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  gateway: vi.fn((id: string) => ({ _modelId: id })),
  streamText: vi.fn(() => ({ stream: null })),
}))

function stubRequiredEnv() {
  vi.stubEnv('DATABASE_URL', 'postgresql://test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon-key')
}

function mockAi() {
  vi.doMock('ai', async (importOriginal) => {
    const original = await importOriginal<typeof import('ai')>()
    return { ...original, createGateway: () => mocks.gateway, streamText: mocks.streamText }
  })
}

describe('lib/ai/provider — getModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    stubRequiredEnv()
    mockAi()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses the default model id when ASSISTANT_MODEL is not configured', async () => {
    // ASSISTANT_MODEL is not set — env.ts ?? fallback must supply the default
    delete process.env.ASSISTANT_MODEL
    const { getModel } = await import('@/lib/ai/provider')
    getModel()
    expect(mocks.gateway).toHaveBeenCalledWith('anthropic/claude-haiku-4.5')
  })

  it('uses a custom model id when ASSISTANT_MODEL is configured', async () => {
    vi.stubEnv('ASSISTANT_MODEL', 'anthropic/claude-opus-4-5')
    const { getModel } = await import('@/lib/ai/provider')
    getModel()
    expect(mocks.gateway).toHaveBeenCalledWith('anthropic/claude-opus-4-5')
  })
})

describe('lib/ai/index — streamAssistantReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    stubRequiredEnv()
    mockAi()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('forwards system, messages, tools, and stopWhen to streamText', async () => {
    const { streamAssistantReply } = await import('@/lib/ai/index')

    const system = 'You are a helpful assistant.'
    const messages = [{ role: 'user' as const, content: 'Hello' }]
    // Use unknown cast — the test only verifies passthrough, not a valid Tool shape
    const tools = { search: {} } as unknown as import('ai').ToolSet
    const stopWhen = { type: 'stepCount' as const, stepCount: 3 } as unknown as import('ai').StopCondition<import('ai').ToolSet>

    await streamAssistantReply({ system, messages, tools, stopWhen })

    expect(mocks.streamText).toHaveBeenCalledOnce()
    const rawCall: unknown = mocks.streamText.mock.calls[0]
    const callArg = (rawCall as unknown[])[0] as Record<string, unknown>
    expect(callArg.system).toBe(system)
    expect(callArg.messages).toBe(messages)
    expect(callArg.tools).toBe(tools)
    expect(callArg.stopWhen).toBe(stopWhen)
    expect(callArg.model).toBeDefined()
  })
})
