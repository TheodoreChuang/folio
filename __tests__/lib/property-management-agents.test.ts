import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PropertyManagementAgent } from '@/db/schema'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

function makeAgent(overrides: Partial<PropertyManagementAgent> = {}): PropertyManagementAgent {
  return {
    id: 'agent-1',
    userId: 'user-1',
    propertyId: 'prop-1',
    agencyName: 'McGrath',
    contactName: null,
    phone: null,
    email: null,
    feePercent: '6.60',
    statementCadence: 'monthly',
    effectiveFrom: '2025-01-01',
    effectiveTo: null,
    isCurrent: true,
    createdAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

function makeSelectChain(resolvedValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(resolvedValue),
    limit: vi.fn().mockResolvedValue(resolvedValue),
  }
}

// Resolves ownership pre-check (mockDb.select before entering a transaction)
function mockOwnershipCheck() {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'prop-1' }]),
  })
}

describe('listManagementAgents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ordered list current-first', async () => {
    const current = makeAgent({ id: 'a', isCurrent: true })
    const prev = makeAgent({ id: 'b', isCurrent: false })
    mockDb.select.mockReturnValue(makeSelectChain([current, prev]))

    const { listManagementAgents } = await import('@/lib/property/repositories/management-agents')
    const result = await listManagementAgents('user-1', 'prop-1')
    expect(result[0].id).toBe('a')
  })

  it('excludes soft-deleted rows (isNull deletedAt applied in WHERE — verified by integration test)', async () => {
    const live = makeAgent({ id: 'live' })
    mockDb.select.mockReturnValue(makeSelectChain([live]))

    const { listManagementAgents } = await import('@/lib/property/repositories/management-agents')
    const result = await listManagementAgents('user-1', 'prop-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('live')
  })
})

describe('findCurrentAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the single current agent', async () => {
    const agent = makeAgent({ isCurrent: true })
    mockDb.select.mockReturnValue(makeSelectChain([agent]))

    const { findCurrentAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await findCurrentAgent('user-1', 'prop-1')
    expect(result?.isCurrent).toBe(true)
  })

  it('returns undefined when no current agent', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]))

    const { findCurrentAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await findCurrentAgent('user-1', 'prop-1')
    expect(result).toBeUndefined()
  })
})

describe('setCurrentManagementAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deactivates existing current agent and inserts new one atomically', async () => {
    const newAgent = makeAgent({ id: 'new-agent', agencyName: 'New Agency' })
    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([newAgent]),
      }),
    }
    mockOwnershipCheck()
    mockDb.transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<PropertyManagementAgent>) => fn(txMock))

    const { setCurrentManagementAgent } = await import('@/lib/property/services/management')
    const result = await setCurrentManagementAgent('user-1', 'prop-1', {
      agencyName: 'New Agency',
      statementCadence: 'monthly',
      effectiveFrom: '2026-01-01',
    })
    expect(result.id).toBe('new-agent')
    expect(txMock.update).toHaveBeenCalled()
    expect(txMock.insert).toHaveBeenCalled()
  })

  it('throws when property does not belong to user', async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),  // no property found
    })

    const { setCurrentManagementAgent } = await import('@/lib/property/services/management')
    await expect(
      setCurrentManagementAgent('user-1', 'other-prop', {
        agencyName: 'New Agency',
        statementCadence: 'monthly',
        effectiveFrom: '2026-01-01',
      })
    ).rejects.toThrow('Property not found')
  })
})

describe('softDeleteManagementAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks agent deleted and promotes the next candidate when deleted agent was current', async () => {
    const promotedId = 'prev-agent'
    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }),
      select: vi.fn()
        .mockReturnValueOnce({  // still-current check → none found (deleted agent was current)
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce({  // candidate search
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ id: promotedId }]),
        }),
    }
    mockOwnershipCheck()
    mockDb.transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock))

    const { softDeleteManagementAgent } = await import('@/lib/property/services/management')
    await softDeleteManagementAgent('user-1', 'prop-1', 'curr-agent')

    expect(txMock.update).toHaveBeenCalledTimes(2)  // delete + promote
  })

  it('does not promote when deleted agent was not the current one', async () => {
    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }),
      select: vi.fn().mockReturnValueOnce({  // still-current check → another agent is still current
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 'other-current' }]),
      }),
    }
    mockOwnershipCheck()
    mockDb.transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock))

    const { softDeleteManagementAgent } = await import('@/lib/property/services/management')
    await softDeleteManagementAgent('user-1', 'prop-1', 'non-curr-agent')

    expect(txMock.update).toHaveBeenCalledTimes(1)  // delete only, no promote
  })

  it('throws when property does not belong to user', async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    })

    const { softDeleteManagementAgent } = await import('@/lib/property/services/management')
    await expect(
      softDeleteManagementAgent('user-1', 'other-prop', 'agent-1')
    ).rejects.toThrow('Property not found')
  })
})
