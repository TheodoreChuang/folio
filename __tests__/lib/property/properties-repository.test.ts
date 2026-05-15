import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listProperties,
  findPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
} from '@/lib/property/repositories/properties'

const mocks = vi.hoisted(() => ({
  mockWhere: vi.fn(),
  mockLimit: vi.fn(),
  mockReturning: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mocks.mockWhere,
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockReturning,
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mocks.mockReturning,
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mocks.mockReturning,
      }),
    }),
  },
}))

const prop = {
  id: 'prop-1111-2222-3333-4444-555555555555',
  userId: 'user-aaa',
  address: '1 Main St',
  nickname: null,
  startDate: '2020-01-01',
  endDate: null,
  entityId: null,
  createdAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

describe('listProperties', () => {
  it('returns properties for user', async () => {
    mocks.mockWhere.mockResolvedValue([prop])
    const result = await listProperties('user-aaa')
    expect(result).toHaveLength(1)
    expect(result[0].address).toBe('1 Main St')
  })

  it('returns empty array when user has no properties', async () => {
    mocks.mockWhere.mockResolvedValue([])
    const result = await listProperties('user-aaa')
    expect(result).toEqual([])
  })
})

describe('findPropertyById', () => {
  it('returns the property when found', async () => {
    mocks.mockWhere.mockReturnValue({ limit: mocks.mockLimit })
    mocks.mockLimit.mockResolvedValue([prop])
    const result = await findPropertyById('user-aaa', prop.id)
    expect(result).toEqual(prop)
  })

  it('returns undefined when not found', async () => {
    mocks.mockWhere.mockReturnValue({ limit: mocks.mockLimit })
    mocks.mockLimit.mockResolvedValue([])
    const result = await findPropertyById('user-aaa', prop.id)
    expect(result).toBeUndefined()
  })
})

describe('createProperty', () => {
  it('inserts and returns the created property', async () => {
    mocks.mockReturning.mockResolvedValue([prop])
    const result = await createProperty({
      userId: 'user-aaa',
      address: '1 Main St',
      nickname: null,
      startDate: '2020-01-01',
      endDate: null,
      entityId: null,
    })
    expect(result).toEqual(prop)
  })
})

describe('updateProperty', () => {
  it('updates and returns the property', async () => {
    mocks.mockReturning.mockResolvedValue([{ ...prop, address: '2 New St' }])
    const result = await updateProperty('user-aaa', prop.id, { address: '2 New St' })
    expect(result?.address).toBe('2 New St')
  })

  it('returns undefined when property not found', async () => {
    mocks.mockReturning.mockResolvedValue([])
    const result = await updateProperty('user-aaa', prop.id, { address: '2 New St' })
    expect(result).toBeUndefined()
  })
})

describe('deleteProperty', () => {
  it('deletes and returns the property', async () => {
    mocks.mockReturning.mockResolvedValue([prop])
    const result = await deleteProperty('user-aaa', prop.id)
    expect(result).toEqual(prop)
  })

  it('returns undefined when property not found', async () => {
    mocks.mockReturning.mockResolvedValue([])
    const result = await deleteProperty('user-aaa', prop.id)
    expect(result).toBeUndefined()
  })
})
