import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, DELETE } from '@/app/api/properties/[id]/loans/[loanId]/route'

const VALID_PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const VALID_LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const loanRow = {
  id: VALID_LOAN_ID,
  userId: 'user-123',
  propertyId: VALID_PROP_ID,
  lender: 'Westpac',
  nickname: 'Investment loan',
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  entityId: null,
  loanType: null,
  ioEndDate: null,
  interestRate: null,
  createdAt: new Date(),
}

function makePatchRequest(propertyId: string, loanId: string, body: unknown) {
  return new Request(`http://localhost/api/properties/${propertyId}/loans/${loanId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest(propertyId: string, loanId: string) {
  return new Request(`http://localhost/api/properties/${propertyId}/loans/${loanId}`, {
    method: 'DELETE',
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateInstallmentLoan: vi.fn(),
  mockEndInstallmentLoan: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/borrowings', () => ({
  updateInstallmentLoan: mocks.mockUpdateInstallmentLoan,
  endInstallmentLoan: mocks.mockEndInstallmentLoan,
}))

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/properties/[id]/loans/[loanId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateInstallmentLoan.mockResolvedValue(loanRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property ID', async () => {
    const res = await PATCH(
      makePatchRequest('bad-id', VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: 'bad-id', loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid loan ID', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, 'bad-loan-id', { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: 'bad-loan-id' }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when no fields provided to update', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, {}),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/no fields/i)
  })

  it('returns 400 when lender is set to empty string', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: '  ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lender/i)
  })

  it('returns 404 when loan not found (wrong user or property)', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce(null)
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 200 and updated loan when lender is changed', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, lender: 'ANZ' })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.lender).toBe('ANZ')
  })

  it('returns 200 when endDate is updated', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, endDate: '2026-03-06' })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { endDate: '2026-03-06' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.endDate).toBe('2026-03-06')
  })

  it('returns 400 when endDate is empty string', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { endDate: '' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/endDate/i)
  })

  it('clears nickname when set to null', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, nickname: null })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { nickname: null }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.nickname).toBeNull()
  })

  it('returns 200 when loanType is interest_only', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, loanType: 'interest_only' })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { loanType: 'interest_only' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.loanType).toBe('interest_only')
  })

  it('returns 200 when loanType is principal_and_interest', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, loanType: 'principal_and_interest' })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { loanType: 'principal_and_interest' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.loanType).toBe('principal_and_interest')
  })

  it('returns 200 and clears loanType when set to null', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, loanType: null })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { loanType: null }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.loanType).toBeNull()
  })

  it('returns 400 when loanType is an invalid value', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { loanType: 'fixed_rate' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 when ioEndDate is set', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, ioEndDate: '2027-06-30' })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { ioEndDate: '2027-06-30' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.ioEndDate).toBe('2027-06-30')
  })

  it('returns 200 and clears ioEndDate when set to null', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, ioEndDate: null })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { ioEndDate: null }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.ioEndDate).toBeNull()
  })

  it('returns 200 when interestRate is a positive number', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, interestRate: '6.35' })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { interestRate: 6.35 }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.interestRate).toBe('6.35')
  })

  it('returns 400 when interestRate is negative', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { interestRate: -1 }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 and clears interestRate when set to null', async () => {
    mocks.mockUpdateInstallmentLoan.mockResolvedValueOnce({ ...loanRow, interestRate: null })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { interestRate: null }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.interestRate).toBeNull()
  })
})

// ── DELETE ────────────────────────────────────────────────────────────────────

describe('DELETE /api/properties/[id]/loans/[loanId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockEndInstallmentLoan.mockResolvedValue({ ...loanRow, endDate: '2026-05-15' })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(
      makeDeleteRequest(VALID_PROP_ID, VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid IDs', async () => {
    const res = await DELETE(
      makeDeleteRequest('bad', VALID_LOAN_ID),
      { params: Promise.resolve({ id: 'bad', loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when loan not found (wrong user or property)', async () => {
    mocks.mockEndInstallmentLoan.mockResolvedValueOnce(null)
    const res = await DELETE(
      makeDeleteRequest(VALID_PROP_ID, VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 200 and success: true when loan is ended', async () => {
    const res = await DELETE(
      makeDeleteRequest(VALID_PROP_ID, VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
