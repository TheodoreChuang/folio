import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/v1/loans/route'

const VALID_PROP_ID  = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const VALID_LOAN_ID  = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const VALID_ENTITY_ID = 'c3d4e5f6-a7b8-4901-c234-333333333333'

const loanRow = {
  id:                  VALID_LOAN_ID,
  userId:              'user-123',
  propertyId:          VALID_PROP_ID,
  lender:              'Commonwealth Bank',
  nickname:            'Inv Loan',
  accountReference:    null,
  startDate:           '2020-01-01',
  endDate:             '2050-01-01',
  entityId:            null,
  loanType:            null,
  ioEndDate:           null,
  interestRate:        null,
  rateType:            null,
  loanTermYears:       null,
  originalAmountCents: null,
  createdAt:           new Date(),
}

function makeGetRequest(params?: Record<string, string>) {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  return new Request(`http://localhost/api/loans${qs}`, { method: 'GET' })
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/loans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser:                  vi.fn(),
  mockFindPropertyById:         vi.fn(),
  mockCreateInstallmentLoan:    vi.fn(),
  mockFindEntityById:           vi.fn(),
  mockListAllLoansFlat:         vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/property', () => ({
  findPropertyById: mocks.mockFindPropertyById,
}))

vi.mock('@/lib/borrowings', () => ({
  listAllLoansFlat:      mocks.mockListAllLoansFlat,
  createInstallmentLoan: mocks.mockCreateInstallmentLoan,
}))

vi.mock('@/lib/entities', () => ({
  findEntityById: mocks.mockFindEntityById,
}))

const minValidBody = {
  lender: 'Commonwealth Bank',
  propertyId: VALID_PROP_ID,
  startDate: '2020-01-01',
  endDate: '2050-01-01',
}

describe('GET /api/loans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockListAllLoansFlat.mockResolvedValue([
      { ...loanRow, latestBalance: null, propertyAddress: '123 Main St', entityName: null },
    ])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('returns loans for the authenticated user', async () => {
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json() as { loans: { id: string; lender: string }[] }
    expect(json.loans).toHaveLength(1)
    expect(json.loans[0].lender).toBe('Commonwealth Bank')
    expect(mocks.mockListAllLoansFlat).toHaveBeenCalledWith('user-123', { entityId: null, lender: null, loanType: null })
  })

  it('returns 400 for invalid entityId (not a UUID)', async () => {
    const res = await GET(makeGetRequest({ entityId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/entityId/i)
  })

  it('returns 400 for invalid loanType', async () => {
    const res = await GET(makeGetRequest({ loanType: 'balloon' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/loanType/i)
  })

  it('passes entityId filter to listAllLoansFlat', async () => {
    await GET(makeGetRequest({ entityId: VALID_ENTITY_ID }))
    expect(mocks.mockListAllLoansFlat).toHaveBeenCalledWith('user-123', { entityId: VALID_ENTITY_ID, lender: null, loanType: null })
  })

  it('passes lender filter to listAllLoansFlat', async () => {
    await GET(makeGetRequest({ lender: 'CBA' }))
    expect(mocks.mockListAllLoansFlat).toHaveBeenCalledWith('user-123', { entityId: null, lender: 'CBA', loanType: null })
  })

  it('passes loanType filter to listAllLoansFlat', async () => {
    await GET(makeGetRequest({ loanType: 'interest_only' }))
    expect(mocks.mockListAllLoansFlat).toHaveBeenCalledWith('user-123', { entityId: null, lender: null, loanType: 'interest_only' })
  })
})

describe('POST /api/loans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFindPropertyById.mockResolvedValue({ id: VALID_PROP_ID })
    mocks.mockCreateInstallmentLoan.mockResolvedValue(loanRow)
    mocks.mockFindEntityById.mockResolvedValue({ id: VALID_ENTITY_ID })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest(minValidBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 when lender is missing', async () => {
    const res = await POST(makePostRequest({ propertyId: VALID_PROP_ID, startDate: '2020-01-01', endDate: '2050-01-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lender/i)
  })

  it('returns 400 when lender is empty string', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, lender: '  ' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lender/i)
  })

  it('returns 400 when propertyId is invalid UUID format', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, propertyId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/propertyId/i)
  })

  it('returns 404 when property not found', async () => {
    mocks.mockFindPropertyById.mockResolvedValueOnce(undefined)
    const res = await POST(makePostRequest(minValidBody))
    expect(res.status).toBe(404)
    expect(mocks.mockCreateInstallmentLoan).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid loanType', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, loanType: 'balloon' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/loanType/i)
  })

  it('returns 400 for invalid rateType', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, rateType: 'tracker' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/rateType/i)
  })

  it('returns 201 for secured loan with all required fields', async () => {
    const res = await POST(makePostRequest(minValidBody))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.loan.lender).toBe('Commonwealth Bank')
  })

  it('returns 201 for unsecured loan (no propertyId)', async () => {
    const res = await POST(makePostRequest({ lender: 'ANZ', loanType: 'line_of_credit' }))
    expect(res.status).toBe(201)
    expect(mocks.mockFindPropertyById).not.toHaveBeenCalled()
  })

  it('passes entityId through to createInstallmentLoan', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, entityId: VALID_ENTITY_ID }))
    expect(res.status).toBe(201)
    expect(mocks.mockCreateInstallmentLoan).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ entityId: VALID_ENTITY_ID }),
    )
  })

  it('returns 404 when entityId belongs to another user', async () => {
    mocks.mockFindEntityById.mockResolvedValueOnce(undefined)
    const res = await POST(makePostRequest({ ...minValidBody, entityId: VALID_ENTITY_ID }))
    expect(res.status).toBe(404)
  })

  it('passes accountReference through to createInstallmentLoan', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, accountReference: 'ending 4821' }))
    expect(res.status).toBe(201)
    expect(mocks.mockCreateInstallmentLoan).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ accountReference: 'ending 4821' }),
    )
  })

  it('accepts line_of_credit loanType', async () => {
    const res = await POST(makePostRequest({ lender: 'ANZ', loanType: 'line_of_credit' }))
    expect(res.status).toBe(201)
    expect(mocks.mockCreateInstallmentLoan).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ loanType: 'line_of_credit' }),
    )
  })

  it('accepts interest_only loanType with ioEndDate', async () => {
    const body = { ...minValidBody, loanType: 'interest_only', ioEndDate: '2027-06-30' }
    const res = await POST(makePostRequest(body))
    expect(res.status).toBe(201)
    expect(mocks.mockCreateInstallmentLoan).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ loanType: 'interest_only', ioEndDate: '2027-06-30' }),
    )
  })

  it('accepts originalAmountCents', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, originalAmountCents: 65000000 }))
    expect(res.status).toBe(201)
    expect(mocks.mockCreateInstallmentLoan).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ originalAmountCents: 65000000 }),
    )
  })

  it('accepts loanTermYears', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, loanTermYears: 30 }))
    expect(res.status).toBe(201)
    expect(mocks.mockCreateInstallmentLoan).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ loanTermYears: 30 }),
    )
  })

  it('accepts rateType variable', async () => {
    const res = await POST(makePostRequest({ ...minValidBody, rateType: 'variable' }))
    expect(res.status).toBe(201)
    expect(mocks.mockCreateInstallmentLoan).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ rateType: 'variable' }),
    )
  })
})
