import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/v1/loans/[id]/balances/route'

const VALID_LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const balanceRow = {
  id:                'e5f6a7b8-c9d0-4123-e456-555555555555',
  userId:            'user-123',
  installmentLoanId: VALID_LOAN_ID,
  balanceCents:      61500000,
  recordedAt:        '2026-04-01',
  notes:             null,
  createdAt:         new Date(),
}

const loanRow = {
  id:           VALID_LOAN_ID,
  userId:       'user-123',
  propertyId:   'a1b2c3d4-e5f6-4789-a012-111111111111',
  lender:       'Westpac',
  nickname:     null,
  startDate:    '2020-01-01',
  endDate:      '2050-01-01',
  entityId:     null,
  loanType:     null,
  ioEndDate:    null,
  interestRate: null,
  createdAt:    new Date(),
}

function makeGetRequest(loanId: string) {
  return new Request(`http://localhost/api/loans/${loanId}/balances`, { method: 'GET' })
}

function makePostRequest(loanId: string, body: unknown) {
  return new Request(`http://localhost/api/loans/${loanId}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser:                  vi.fn(),
  mockFindInstallmentLoanById:  vi.fn(),
  mockListInstallmentLoanBalances: vi.fn(),
  mockCreateInstallmentLoanBalance: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/borrowings', () => ({
  findInstallmentLoanById:          mocks.mockFindInstallmentLoanById,
  listInstallmentLoanBalances:      mocks.mockListInstallmentLoanBalances,
  createInstallmentLoanBalance:     mocks.mockCreateInstallmentLoanBalance,
}))

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/loans/[id]/balances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindInstallmentLoanById.mockResolvedValue(loanRow)
    mocks.mockListInstallmentLoanBalances.mockResolvedValue([balanceRow])
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

  it('returns 404 when loan belongs to another user', async () => {
    mocks.mockFindInstallmentLoanById.mockResolvedValue(undefined)
    const res = await GET(
      makeGetRequest(VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns { balances: [...] } sorted recordedAt DESC', async () => {
    const res = await GET(
      makeGetRequest(VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json() as { balances: unknown[] }
    expect(json.balances).toHaveLength(1)
  })
})

// ── POST ──────────────────────────────────────────────────────────────────────

describe('POST /api/loans/[id]/balances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindInstallmentLoanById.mockResolvedValue(loanRow)
    mocks.mockCreateInstallmentLoanBalance.mockResolvedValue(balanceRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { recordedAt: '2026-04-01', balanceCents: 61500000 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when loan belongs to another user', async () => {
    mocks.mockFindInstallmentLoanById.mockResolvedValue(undefined)
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { recordedAt: '2026-04-01', balanceCents: 61500000 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('creates a balance and returns 201', async () => {
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { recordedAt: '2026-04-01', balanceCents: 61500000 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(201)
    const json = await res.json() as { balance: { id: string } }
    expect(json.balance.id).toBe(balanceRow.id)
    expect(mocks.mockCreateInstallmentLoanBalance).toHaveBeenCalledWith(
      'user-123',
      VALID_LOAN_ID,
      expect.objectContaining({ recordedAt: '2026-04-01', balanceCents: 61500000 }),
    )
  })

  it('returns 400 when recordedAt is missing', async () => {
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { balanceCents: 61500000 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when balanceCents is negative', async () => {
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { recordedAt: '2026-04-01', balanceCents: -1 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 409 on duplicate recordedAt', async () => {
    mocks.mockCreateInstallmentLoanBalance.mockRejectedValue({ code: '23505' })
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { recordedAt: '2026-04-01', balanceCents: 61500000 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(409)
  })
})
