import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/v1/loans/[id]/repayments/route'

const VALID_LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const repaymentRow = {
  id:                'c3d4e5f6-a7b8-4901-c234-333333333333',
  userId:            'user-123',
  installmentLoanId: VALID_LOAN_ID,
  paymentDate:       '2026-04-01',
  amountCents:       216700,
  interestCents:     150000,
  principalCents:    66700,
  description:       null,
  sourceDocumentId:  null,
  deletedAt:         null,
  createdAt:         new Date(),
  sourceFileName:    null,
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
  return new Request(`http://localhost/api/loans/${loanId}/repayments`, { method: 'GET' })
}

function makePostRequest(loanId: string, body: unknown) {
  return new Request(`http://localhost/api/loans/${loanId}/repayments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser:                vi.fn(),
  mockFindInstallmentLoanById: vi.fn(),
  mockListLoanLedgerEntries:  vi.fn(),
  mockCreateLoanLedgerEntry:  vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/borrowings', () => ({
  findInstallmentLoanById:   mocks.mockFindInstallmentLoanById,
  listLoanLedgerEntries:     mocks.mockListLoanLedgerEntries,
  createLoanLedgerEntry:     mocks.mockCreateLoanLedgerEntry,
}))

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/loans/[id]/repayments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindInstallmentLoanById.mockResolvedValue(loanRow)
    mocks.mockListLoanLedgerEntries.mockResolvedValue([repaymentRow])
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
    mocks.mockFindInstallmentLoanById.mockResolvedValue(undefined)
    const res = await GET(
      makeGetRequest(VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns { repayments: [...] } for authenticated user', async () => {
    const res = await GET(
      makeGetRequest(VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json() as { repayments: unknown[] }
    expect(json.repayments).toHaveLength(1)
  })
})

// ── POST ──────────────────────────────────────────────────────────────────────

describe('POST /api/loans/[id]/repayments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindInstallmentLoanById.mockResolvedValue(loanRow)
    mocks.mockCreateLoanLedgerEntry.mockResolvedValue(repaymentRow)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { paymentDate: '2026-04-01', amountCents: 216700 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when loan belongs to another user', async () => {
    mocks.mockFindInstallmentLoanById.mockResolvedValue(undefined)
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { paymentDate: '2026-04-01', amountCents: 216700 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('creates a repayment and returns 201 with { repayment: {...} }', async () => {
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { paymentDate: '2026-04-01', amountCents: 216700 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(201)
    const json = await res.json() as { repayment: { id: string } }
    expect(json.repayment.id).toBe(repaymentRow.id)
    expect(mocks.mockCreateLoanLedgerEntry).toHaveBeenCalledWith(
      'user-123',
      VALID_LOAN_ID,
      expect.objectContaining({ paymentDate: '2026-04-01', amountCents: 216700 }),
    )
  })

  it('returns 400 when paymentDate is missing', async () => {
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { amountCents: 216700 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when amountCents is 0', async () => {
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { paymentDate: '2026-04-01', amountCents: 0 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when amountCents is negative', async () => {
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { paymentDate: '2026-04-01', amountCents: -100 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 201 when no optional fields provided', async () => {
    mocks.mockCreateLoanLedgerEntry.mockResolvedValue({
      ...repaymentRow,
      interestCents: null,
      principalCents: null,
    })
    const res = await POST(
      makePostRequest(VALID_LOAN_ID, { paymentDate: '2026-04-01', amountCents: 216700 }),
      { params: Promise.resolve({ id: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(201)
    const json = await res.json() as { repayment: { interestCents: null; principalCents: null } }
    expect(json.repayment.interestCents).toBeNull()
    expect(json.repayment.principalCents).toBeNull()
  })
})
