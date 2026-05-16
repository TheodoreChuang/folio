import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/properties/[id]/loan-payments/route'

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const loanRow = {
  id: LOAN_ID,
  userId: 'user-123',
  propertyId: PROP_ID,
  lender: 'Westpac',
  nickname: 'Investment loan',
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  entityId: null,
  createdAt: new Date(),
}

const entryRow = {
  id: 'e1111111-1111-4111-a111-111111111111',
  userId: 'user-123',
  propertyId: PROP_ID,
  sourceDocumentId: null,
  installmentLoanId: LOAN_ID,
  lineItemDate: '2026-03-01',
  amountCents: 210000,
  category: 'loan_payment',
  description: 'Westpac — Investment loan repayment 2026-03',
  userNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

function makePostRequest(propertyId: string, body: unknown) {
  return new Request(`http://localhost/api/properties/${propertyId}/loan-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockValidateLoanOwnership: vi.fn(),
  mockUpsertLoanPaymentEntry: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/borrowings', () => ({
  validateLoanOwnership: mocks.mockValidateLoanOwnership,
}))

vi.mock('@/lib/property', () => ({
  upsertLoanPaymentEntry: mocks.mockUpsertLoanPaymentEntry,
}))

const validBody = {
  loanAccountId: LOAN_ID,
  amountCents: 210000,
  lineItemDate: '2026-03-01',
}

describe('POST /api/properties/[id]/loan-payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockValidateLoanOwnership.mockResolvedValue(loanRow)
    mocks.mockUpsertLoanPaymentEntry.mockResolvedValue(entryRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest(PROP_ID, validBody), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property ID', async () => {
    const res = await POST(makePostRequest('bad-id', validBody), { params: Promise.resolve({ id: 'bad-id' }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/property/i)
  })

  it('returns 400 when loanAccountId is missing', async () => {
    const { loanAccountId: _, ...body } = validBody
    const res = await POST(makePostRequest(PROP_ID, body), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/loanAccountId/i)
  })

  it('returns 400 when loanAccountId is not a UUID', async () => {
    const res = await POST(makePostRequest(PROP_ID, { ...validBody, loanAccountId: 'not-a-uuid' }), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/loanAccountId/i)
  })

  it('returns 400 when amountCents is missing', async () => {
    const { amountCents: _, ...body } = validBody
    const res = await POST(makePostRequest(PROP_ID, body), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/amountCents/i)
  })

  it('returns 400 when amountCents is zero', async () => {
    const res = await POST(makePostRequest(PROP_ID, { ...validBody, amountCents: 0 }), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/amountCents/i)
  })

  it('returns 400 when amountCents is negative', async () => {
    const res = await POST(makePostRequest(PROP_ID, { ...validBody, amountCents: -100 }), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when lineItemDate is missing', async () => {
    const { lineItemDate: _, ...body } = validBody
    const res = await POST(makePostRequest(PROP_ID, body), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lineItemDate/i)
  })

  it('returns 400 when lineItemDate is not YYYY-MM-DD', async () => {
    const res = await POST(makePostRequest(PROP_ID, { ...validBody, lineItemDate: '03/01/2026' }), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lineItemDate/i)
  })

  it('returns 404 when loan is not found for the property', async () => {
    mocks.mockValidateLoanOwnership.mockResolvedValueOnce(null)
    const res = await POST(makePostRequest(PROP_ID, validBody), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockUpsertLoanPaymentEntry).not.toHaveBeenCalled()
  })

  it('returns 201 with created entry on success', async () => {
    const res = await POST(makePostRequest(PROP_ID, validBody), { params: Promise.resolve({ id: PROP_ID }) })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.entry.id).toBe(entryRow.id)
    expect(json.entry.category).toBe('loan_payment')
    expect(json.entry.amountCents).toBe(210000)
  })

  it('derives description from loan.lender and loan.nickname', async () => {
    await POST(makePostRequest(PROP_ID, validBody), { params: Promise.resolve({ id: PROP_ID }) })
    expect(mocks.mockUpsertLoanPaymentEntry).toHaveBeenCalledWith(
      'user-123',
      PROP_ID,
      LOAN_ID,
      '2026-03-01',
      210000,
      'Westpac — Investment loan repayment 2026-03',
    )
  })

  it('omits nickname from description when loan.nickname is null', async () => {
    mocks.mockValidateLoanOwnership.mockResolvedValueOnce({ ...loanRow, nickname: null })
    await POST(makePostRequest(PROP_ID, validBody), { params: Promise.resolve({ id: PROP_ID }) })
    expect(mocks.mockUpsertLoanPaymentEntry).toHaveBeenCalledWith(
      'user-123',
      PROP_ID,
      LOAN_ID,
      '2026-03-01',
      210000,
      'Westpac repayment 2026-03',
    )
  })
})
