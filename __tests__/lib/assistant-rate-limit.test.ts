import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockGetTodayUsage: vi.fn(),
  mockAtomicConsumeIfAllowed: vi.fn(),
}))

vi.mock('@/lib/assistant/repositories/usage', () => ({
  getTodayUsage: mocks.mockGetTodayUsage,
  atomicConsumeIfAllowed: mocks.mockAtomicConsumeIfAllowed,
}))

// Import after mocks are registered
const { checkAllowance, consumeIfAllowed, DAILY_MESSAGE_CAP } = await import('@/lib/assistant/services/rate-limit')

describe('DAILY_MESSAGE_CAP', () => {
  it('is 25', () => {
    expect(DAILY_MESSAGE_CAP).toBe(25)
  })
})

describe('checkAllowance — fast UX read (not the gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns allowed:true, used:0 when no row exists for today', async () => {
    mocks.mockGetTodayUsage.mockResolvedValue(undefined)
    const result = await checkAllowance('user-123')
    expect(result).toEqual({ allowed: true, used: 0, limit: 25 })
  })

  it('returns allowed:true when used is under the cap', async () => {
    mocks.mockGetTodayUsage.mockResolvedValue(10)
    const result = await checkAllowance('user-123')
    expect(result).toEqual({ allowed: true, used: 10, limit: 25 })
  })

  it('returns allowed:true when used is 24 (one below cap)', async () => {
    mocks.mockGetTodayUsage.mockResolvedValue(24)
    const result = await checkAllowance('user-123')
    expect(result).toEqual({ allowed: true, used: 24, limit: 25 })
  })

  it('returns allowed:false when used equals cap (25)', async () => {
    mocks.mockGetTodayUsage.mockResolvedValue(25)
    const result = await checkAllowance('user-123')
    expect(result).toEqual({ allowed: false, used: 25, limit: 25 })
  })

  it('returns allowed:false when used exceeds cap (sentinel 26)', async () => {
    mocks.mockGetTodayUsage.mockResolvedValue(26)
    const result = await checkAllowance('user-123')
    expect(result).toEqual({ allowed: false, used: 26, limit: 25 })
  })

  it('calls getTodayUsage with userId and today in UTC', async () => {
    mocks.mockGetTodayUsage.mockResolvedValue(undefined)
    await checkAllowance('user-abc')
    const today = new Date().toISOString().slice(0, 10)
    expect(mocks.mockGetTodayUsage).toHaveBeenCalledWith('user-abc', today)
  })
})

describe('consumeIfAllowed — atomic admission gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('at count=0 returns admitted:true, used:1', async () => {
    mocks.mockAtomicConsumeIfAllowed.mockResolvedValue({ admitted: true, used: 1 })
    const result = await consumeIfAllowed('user-123')
    expect(result).toEqual({ admitted: true, used: 1 })
  })

  it('at count=24 returns admitted:true, used:25', async () => {
    mocks.mockAtomicConsumeIfAllowed.mockResolvedValue({ admitted: true, used: 25 })
    const result = await consumeIfAllowed('user-123')
    expect(result).toEqual({ admitted: true, used: 25 })
  })

  it('at count=25 returns admitted:false, used:26 (sentinel)', async () => {
    mocks.mockAtomicConsumeIfAllowed.mockResolvedValue({ admitted: false, used: 26 })
    const result = await consumeIfAllowed('user-123')
    expect(result).toEqual({ admitted: false, used: 26 })
  })

  it('at count=26 (already sentinel) returns admitted:false, used:26', async () => {
    mocks.mockAtomicConsumeIfAllowed.mockResolvedValue({ admitted: false, used: 26 })
    const result = await consumeIfAllowed('user-123')
    expect(result).toEqual({ admitted: false, used: 26 })
  })

  it('calls atomicConsumeIfAllowed with userId and today in UTC', async () => {
    mocks.mockAtomicConsumeIfAllowed.mockResolvedValue({ admitted: true, used: 1 })
    await consumeIfAllowed('user-xyz')
    const today = new Date().toISOString().slice(0, 10)
    expect(mocks.mockAtomicConsumeIfAllowed).toHaveBeenCalledWith('user-xyz', today)
  })
})
