import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PropertyTenancy } from '@/db/schema'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/property/repositories/tenancies', async (importOriginal) => {
  return importOriginal()
})

function makeTenancy(overrides: Partial<PropertyTenancy> = {}): PropertyTenancy {
  return {
    id: 'tenancy-1',
    userId: 'user-1',
    propertyId: 'prop-1',
    tenants: 'John Smith',
    leaseType: 'fixed_term',
    leaseStart: '2025-01-01',
    leaseEnd: '2026-01-01',
    weeklyRentCents: 60000,
    bondCents: 240000,
    isCurrent: true,
    createdAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

function makeChain(resolvedValue: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(resolvedValue),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(resolvedValue),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
  return chain
}

describe('listTenancies', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows ordered current-first', async () => {
    const current = makeTenancy({ id: 'a', isCurrent: true })
    const prev = makeTenancy({ id: 'b', isCurrent: false })
    const chain = makeChain([current, prev])
    mockDb.select.mockReturnValue(chain)

    const { listTenancies } = await import('@/lib/property/repositories/tenancies')
    const result = await listTenancies('user-1', 'prop-1')
    expect(result[0].id).toBe('a')
    expect(mockDb.select).toHaveBeenCalled()
  })

  it('returns multiple is_current=true rows (sharehouse)', async () => {
    const t1 = makeTenancy({ id: 'a', isCurrent: true })
    const t2 = makeTenancy({ id: 'b', isCurrent: true })
    const chain = makeChain([t1, t2])
    mockDb.select.mockReturnValue(chain)

    const { listTenancies } = await import('@/lib/property/repositories/tenancies')
    const result = await listTenancies('user-1', 'prop-1')
    expect(result).toHaveLength(2)
    expect(result.every(t => t.isCurrent)).toBe(true)
  })
})

describe('createTenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a new is_current=true row and returns it', async () => {
    const newRow = makeTenancy({ id: 'new-1', isCurrent: true })
    const chain = makeChain([newRow])
    mockDb.insert.mockReturnValue(chain)

    const { createTenancy } = await import('@/lib/property/repositories/tenancies')
    const result = await createTenancy({
      userId: 'user-1',
      propertyId: 'prop-1',
      leaseType: 'fixed_term',
      leaseStart: '2025-01-01',
      weeklyRentCents: 60000,
    })
    expect(result.id).toBe('new-1')
    expect(result.isCurrent).toBe(true)
  })
})

describe('endTenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets is_current=false on the target row only', async () => {
    const updated = makeTenancy({ id: 'tenancy-1', isCurrent: false })
    const chain = makeChain([updated])
    chain.update = vi.fn().mockReturnThis()
    chain.set = vi.fn().mockReturnThis()
    chain.where = vi.fn().mockReturnThis()
    chain.returning = vi.fn().mockResolvedValue([updated])
    mockDb.update.mockReturnValue(chain)

    const { endTenancy } = await import('@/lib/property/repositories/tenancies')
    const result = await endTenancy('user-1', 'tenancy-1')
    expect(result?.isCurrent).toBe(false)
  })
})

describe('softDeleteTenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets deletedAt and isCurrent=false', async () => {
    const updated = makeTenancy({ id: 'tenancy-1', isCurrent: false, deletedAt: new Date() })
    const chain = makeChain([updated])
    chain.update = vi.fn().mockReturnThis()
    chain.set = vi.fn().mockReturnThis()
    chain.where = vi.fn().mockReturnThis()
    chain.returning = vi.fn().mockResolvedValue([updated])
    mockDb.update.mockReturnValue(chain)

    const { softDeleteTenancy } = await import('@/lib/property/repositories/tenancies')
    const result = await softDeleteTenancy('user-1', 'tenancy-1')
    expect(result?.deletedAt).not.toBeNull()
    expect(result?.isCurrent).toBe(false)
  })
})

describe('renewTenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs atomically: ends old tenancy and inserts new one', async () => {
    const newRow = makeTenancy({ id: 'new-tenancy', isCurrent: true })
    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([newRow]),
      }),
    }
    mockDb.transaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => {
      await fn(txMock)
    })

    const { renewTenancy } = await import('@/lib/property/services/management')
    const result = await renewTenancy('user-1', 'prop-1', 'old-tenancy', {
      leaseType: 'fixed_term',
      leaseStart: '2026-01-01',
      weeklyRentCents: 65000,
    })
    expect(result.id).toBe('new-tenancy')
    expect(result.isCurrent).toBe(true)
    expect(txMock.update).toHaveBeenCalled()
    expect(txMock.insert).toHaveBeenCalled()
  })
})
