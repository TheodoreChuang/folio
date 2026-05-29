import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/household/items/route'

const USER_ID = 'user-abc-123'
const ITEM_ID = 'dddd0001-0000-4000-d000-000000000001'

const incomeItem = {
  id: ITEM_ID,
  userId: USER_ID,
  type: 'income' as const,
  name: 'Salary',
  amountCents: 500000,
  frequency: 'monthly' as const,
  effectiveFrom: '2024-01-01',
  detail: null,
  category: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const expenseItem = {
  id: 'dddd0002-0000-4000-d000-000000000002',
  userId: USER_ID,
  type: 'expense' as const,
  name: 'Rent',
  amountCents: 200000,
  frequency: 'monthly' as const,
  effectiveFrom: '2024-01-01',
  detail: null,
  category: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

vi.mock('@/lib/household', () => ({
  listBudgetItems: vi.fn(),
  createBudgetItem: vi.fn(),
}))

vi.mock('@/lib/household/compute', () => ({
  toMonthlyCents: vi.fn((amountCents: number) => amountCents),
  toAnnualCents:  vi.fn((amountCents: number) => amountCents),
  computeSummary: vi.fn(() => ({
    totalIncomeMonthlyCents: 0,
    totalExpensesMonthlyCents: 0,
    surplusMonthlyCents: 0,
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/api-error', () => ({
  captureError: vi.fn(),
}))

import { listBudgetItems, createBudgetItem } from '@/lib/household'
import { toMonthlyCents, computeSummary } from '@/lib/household/compute'
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

function makeRequest(method: string, body?: unknown) {
  return new Request('http://localhost/api/household/items', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/household/items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    vi.mocked(listBudgetItems).mockResolvedValue([])
    vi.mocked(computeSummary).mockReturnValue({
      totalIncomeMonthlyCents: 0,
      totalExpensesMonthlyCents: 0,
      surplusMonthlyCents: 0,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 200 with empty items and zero summary when no items exist', async () => {
    vi.mocked(listBudgetItems).mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
    expect(body.summary).toEqual({
      totalIncomeMonthlyCents: 0,
      totalExpensesMonthlyCents: 0,
      surplusMonthlyCents: 0,
    })
  })

  it('returns items enriched with monthlyCents', async () => {
    vi.mocked(listBudgetItems).mockResolvedValue([incomeItem])
    vi.mocked(toMonthlyCents).mockReturnValue(500000)
    vi.mocked(computeSummary).mockReturnValue({
      totalIncomeMonthlyCents: 500000,
      totalExpensesMonthlyCents: 0,
      surplusMonthlyCents: 500000,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].monthlyCents).toBe(500000)
    expect(body.summary.totalIncomeMonthlyCents).toBe(500000)
  })

  it('calls listBudgetItems with userId', async () => {
    await GET()
    expect(listBudgetItems).toHaveBeenCalledWith(USER_ID)
  })

  it('calls computeSummary with raw items', async () => {
    vi.mocked(listBudgetItems).mockResolvedValue([incomeItem, expenseItem])
    await GET()
    expect(computeSummary).toHaveBeenCalledWith([incomeItem, expenseItem])
  })
})

describe('POST /api/household/items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth()
    vi.mocked(createBudgetItem).mockResolvedValue(incomeItem)
    vi.mocked(toMonthlyCents).mockReturnValue(500000)
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth(null)
    const res = await POST(makeRequest('POST', { type: 'income', name: 'Salary', amountCents: 500000, frequency: 'monthly' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when type is missing', async () => {
    const res = await POST(makeRequest('POST', { name: 'Salary', amountCents: 500000, frequency: 'monthly' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/type/i)
  })

  it('returns 400 when type is not income or expense', async () => {
    const res = await POST(makeRequest('POST', { type: 'invalid', name: 'Salary', amountCents: 500000, frequency: 'monthly' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', { type: 'income', amountCents: 500000, frequency: 'monthly' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when name is empty string', async () => {
    const res = await POST(makeRequest('POST', { type: 'income', name: '', amountCents: 500000, frequency: 'monthly' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amountCents is zero', async () => {
    const res = await POST(makeRequest('POST', { type: 'income', name: 'Salary', amountCents: 0, frequency: 'monthly' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when amountCents is negative', async () => {
    const res = await POST(makeRequest('POST', { type: 'income', name: 'Salary', amountCents: -100, frequency: 'monthly' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when frequency is invalid', async () => {
    const res = await POST(makeRequest('POST', { type: 'income', name: 'Salary', amountCents: 500000, frequency: 'quarterly' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 with created item including monthlyCents', async () => {
    const res = await POST(makeRequest('POST', { type: 'income', name: 'Salary', amountCents: 500000, frequency: 'monthly' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.item).toBeDefined()
    expect(body.item.monthlyCents).toBe(500000)
  })

  it('accepts all four frequency values', async () => {
    for (const frequency of ['weekly', 'fortnightly', 'monthly', 'annual'] as const) {
      vi.clearAllMocks()
      mockAuth()
      vi.mocked(createBudgetItem).mockResolvedValue({ ...incomeItem, frequency })
      vi.mocked(toMonthlyCents).mockReturnValue(100)
      const res = await POST(makeRequest('POST', { type: 'income', name: 'Salary', amountCents: 500000, frequency }))
      expect(res.status).toBe(201)
    }
  })

  it('accepts optional effectiveFrom', async () => {
    const res = await POST(makeRequest('POST', {
      type: 'income', name: 'Salary', amountCents: 500000, frequency: 'monthly', effectiveFrom: '2024-06-01',
    }))
    expect(res.status).toBe(201)
    expect(createBudgetItem).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveFrom: '2024-06-01' })
    )
  })

  it('returns 500 when repository throws', async () => {
    vi.mocked(createBudgetItem).mockRejectedValue(new Error('DB error'))
    const res = await POST(makeRequest('POST', { type: 'income', name: 'Salary', amountCents: 500000, frequency: 'monthly' }))
    expect(res.status).toBe(500)
  })
})
