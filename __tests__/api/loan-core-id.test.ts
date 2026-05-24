import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from '@/app/api/loans/[id]/route'

const VALID_LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const PROP_ID       = 'a1b2c3d4-e5f6-4789-a012-111111111111'

const loanDetail = {
  id:              VALID_LOAN_ID,
  userId:          'user-123',
  propertyId:      PROP_ID,
  lender:          'Westpac',
  nickname:        'Investment loan',
  startDate:       '2020-01-01',
  endDate:         '2050-01-01',
  entityId:        null,
  loanType:        null,
  ioEndDate:       null,
  interestRate:    null,
  createdAt:       new Date(),
  propertyAddress: '123 Elm St',
  latestBalance:   { balanceCents: 61500000, recordedAt: '2026-04-01' },
}

function makeGetRequest(loanId: string) {
  return new Request(`http://localhost/api/loans/${loanId}`, { method: 'GET' })
}

function makePatchRequest(loanId: string, body: unknown) {
  return new Request(`http://localhost/api/loans/${loanId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser:                 vi.fn(),
  mockFindInstallmentLoanDetail: vi.fn(),
  mockUpdateInstallmentLoanById: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/borrowings', () => ({
  findInstallmentLoanDetail: mocks.mockFindInstallmentLoanDetail,
  updateInstallmentLoanById: mocks.mockUpdateInstallmentLoanById,
}))

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/loans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindInstallmentLoanDetail.mockResolvedValue(loanDetail)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      makeGetRequest(VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid loan ID', async () => {
    const res = await GET(
      makeGetRequest('bad-id'),
      { params: Promise.resolve({ id: 'bad-id' }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when loan not found or belongs to another user', async () => {
    mocks.mockFindInstallmentLoanDetail.mockResolvedValue(undefined)
    const res = await GET(
      makeGetRequest(VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns { loan: { ...fields, propertyAddress, latestBalance } } for authenticated user', async () => {
    const res = await GET(
      makeGetRequest(VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json() as { loan: typeof loanDetail }
    expect(json.loan.id).toBe(VALID_LOAN_ID)
    expect(json.loan.propertyAddress).toBe('123 Elm St')
    expect(json.loan.latestBalance).toMatchObject({ balanceCents: 61500000 })
  })
})

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/loans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateInstallmentLoanById.mockResolvedValue(loanDetail)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(
      makePatchRequest(VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid loan ID', async () => {
    const res = await PATCH(
      makePatchRequest('bad-id', { lender: 'ANZ' }),
      { params: Promise.resolve({ id: 'bad-id' }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 with empty lender', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_LOAN_ID, { lender: '' }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/lender/i)
  })

  it('returns 400 when no fields provided', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_LOAN_ID, {}),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when loan belongs to another user', async () => {
    mocks.mockUpdateInstallmentLoanById.mockResolvedValue(undefined)
    const res = await PATCH(
      makePatchRequest(VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('updates allowed fields and returns updated loan', async () => {
    mocks.mockUpdateInstallmentLoanById.mockResolvedValue({ ...loanDetail, lender: 'ANZ' })
    const res = await PATCH(
      makePatchRequest(VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json() as { loan: { lender: string } }
    expect(json.loan.lender).toBe('ANZ')
  })

  it('accepts loanType: interest_only with null ioEndDate', async () => {
    mocks.mockUpdateInstallmentLoanById.mockResolvedValue({
      ...loanDetail,
      loanType: 'interest_only',
      ioEndDate: null,
    })
    const res = await PATCH(
      makePatchRequest(VALID_LOAN_ID, { loanType: 'interest_only', ioEndDate: null }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json() as { loan: { loanType: string; ioEndDate: null } }
    expect(json.loan.loanType).toBe('interest_only')
    expect(json.loan.ioEndDate).toBeNull()
  })
})
