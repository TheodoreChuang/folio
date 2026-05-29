import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, DELETE } from '@/app/api/household/items/[id]/route'

const USER_ID = 'user-abc-123'
const ITEM_ID = 'dddd0001-0000-4000-d000-000000000001'
const INVALID_ID = 'not-a-uuid'

const updatedItem = {
  id: ITEM_ID,
  userId: USER_ID,
  type: 'income' as const,
  name: 'Updated Salary',
  amountCents: 600000,
  frequency: 'monthly' as const,
  effectiveFrom: '2024-01-01',
  category: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

vi.mock('@/lib/household', () => ({
  updateBudgetItem: vi.fn(),
  softDeleteBudgetItem: vi.fn(),
}))

vi.mock('@/lib/household/compute', () => ({
  toMonthlyCents: vi.fn((amountCents: number) => amountCents),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/api-error', () => ({
  captureError: vi.fn(),
}))

import { updateBudgetItem, softDeleteBudgetItem } from '@/lib/household'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function mockAuth(userId: string | null = USER_ID) {
  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
  }
  vi.mocked(createServerSupabaseClient).mockResolvedValue(mockSupabase as never)
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(method: string, body?: unknown) {
  return new Request(`http://localhost/api/household/items/${ITEM_ID}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('PATCH /api/household/items/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    vi.mocked(updateBudgetItem).mockResolvedValue(updatedItem)
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth(null)
    const res = await PATCH(makeRequest('PATCH', { name: 'New Name' }), makeParams(ITEM_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-UUID id', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: 'New Name' }), makeParams(INVALID_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty body', async () => {
    const res = await PATCH(makeRequest('PATCH', {}), makeParams(ITEM_ID))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/at least one field/i)
  })

  it('returns 400 when name is empty string', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: '' }), makeParams(ITEM_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amountCents is negative', async () => {
    const res = await PATCH(makeRequest('PATCH', { amountCents: -100 }), makeParams(ITEM_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amountCents is zero', async () => {
    const res = await PATCH(makeRequest('PATCH', { amountCents: 0 }), makeParams(ITEM_ID))
    expect(res.status).toBe(400)
  })

  it('returns 400 when frequency is unrecognised', async () => {
    const res = await PATCH(makeRequest('PATCH', { frequency: 'quarterly' }), makeParams(ITEM_ID))
    expect(res.status).toBe(400)
  })

  it('returns 404 when updateBudgetItem returns undefined', async () => {
    vi.mocked(updateBudgetItem).mockResolvedValue(undefined)
    const res = await PATCH(makeRequest('PATCH', { name: 'New Name' }), makeParams(ITEM_ID))
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated item and monthlyCents', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: 'Updated Salary' }), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.item).toBeDefined()
    expect(body.item.monthlyCents).toBeDefined()
    expect(body.item.name).toBe('Updated Salary')
  })

  it('accepts partial update with only name', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: 'New Name' }), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    expect(updateBudgetItem).toHaveBeenCalledWith(USER_ID, ITEM_ID, { name: 'New Name' })
  })

  it('accepts partial update with only amountCents and frequency', async () => {
    const res = await PATCH(makeRequest('PATCH', { amountCents: 700000, frequency: 'fortnightly' }), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    expect(updateBudgetItem).toHaveBeenCalledWith(USER_ID, ITEM_ID, { amountCents: 700000, frequency: 'fortnightly' })
  })
})

describe('DELETE /api/household/items/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    vi.mocked(softDeleteBudgetItem).mockResolvedValue(updatedItem)
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth(null)
    const res = await DELETE(makeRequest('DELETE'), makeParams(ITEM_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for non-UUID id', async () => {
    const res = await DELETE(makeRequest('DELETE'), makeParams(INVALID_ID))
    expect(res.status).toBe(400)
  })

  it('returns 404 when softDeleteBudgetItem returns undefined', async () => {
    vi.mocked(softDeleteBudgetItem).mockResolvedValue(undefined)
    const res = await DELETE(makeRequest('DELETE'), makeParams(ITEM_ID))
    expect(res.status).toBe(404)
  })

  it('returns 200 with success true on successful soft delete', async () => {
    const res = await DELETE(makeRequest('DELETE'), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})
