import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listValuations,
  findLatestValuation,
  createValuation,
  deleteValuation,
} from '@/lib/property/repositories/valuations'

const mocks = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockOrderByLimit: vi.fn(),
  mockReturning: vi.fn(),
  mockWhere: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn(() => ({
              limit: mocks.mockOrderByLimit,
              then: (resolve: (v: unknown[]) => void) =>
                Promise.resolve(mocks.mockWhere()).then(resolve),
            })),
          }),
        }),
      }
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockReturning,
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mocks.mockReturning,
      }),
    }),
  },
}))

const valuation = {
  id: 'val-111',
  userId: 'user-aaa',
  propertyId: 'prop-111',
  valuedAt: '2026-01-01',
  valueCents: 50000000,
  source: 'bank',
  notes: null,
  createdAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

describe('listValuations', () => {
  it('returns all valuations for a property ordered by date desc', async () => {
    mocks.mockWhere.mockResolvedValue([valuation])
    const result = await listValuations('user-aaa', 'prop-111')
    expect(result).toHaveLength(1)
    expect(result[0].valueCents).toBe(50000000)
  })
})

describe('findLatestValuation', () => {
  it('returns the most recent valuation', async () => {
    mocks.mockOrderByLimit.mockResolvedValue([valuation])
    const result = await findLatestValuation('user-aaa', 'prop-111')
    expect(result).toEqual(valuation)
  })

  it('returns undefined when no valuations', async () => {
    mocks.mockOrderByLimit.mockResolvedValue([])
    const result = await findLatestValuation('user-aaa', 'prop-111')
    expect(result).toBeUndefined()
  })
})

describe('createValuation', () => {
  it('inserts and returns the valuation', async () => {
    mocks.mockReturning.mockResolvedValue([valuation])
    const result = await createValuation({
      userId: 'user-aaa',
      propertyId: 'prop-111',
      valuedAt: '2026-01-01',
      valueCents: 50000000,
      source: 'bank',
      notes: null,
    })
    expect(result).toEqual(valuation)
  })
})

describe('deleteValuation', () => {
  it('deletes and returns the valuation', async () => {
    mocks.mockReturning.mockResolvedValue([valuation])
    const result = await deleteValuation('user-aaa', 'prop-111', valuation.id)
    expect(result).toEqual(valuation)
  })

  it('returns undefined when not found', async () => {
    mocks.mockReturning.mockResolvedValue([])
    const result = await deleteValuation('user-aaa', 'prop-111', valuation.id)
    expect(result).toBeUndefined()
  })
})
