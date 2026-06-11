import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ingestion/loan-staged/route'
import { PATCH } from '@/app/api/ingestion/loan-staged/[id]/route'

const VALID_ID = 'a1b2c3d4-e5f6-4789-a012-345678901234'
const VALID_DOC_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const VALID_LOAN_ID = 'c3d4e5f6-a7b8-4901-c234-333333333333'

const loanStagingItem = {
  id: VALID_ID,
  userId: 'user-123',
  sourceDocumentId: VALID_DOC_ID,
  lineItemIndex: 0,
  paymentDate: '2026-03-15',
  amountCents: 250000,
  interestCents: 150000,
  principalCents: 100000,
  description: null,
  confidence: 'high',
  installmentLoanId: null,
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const sourceDoc = {
  id: VALID_DOC_ID,
  userId: 'user-123',
  fileName: 'loan-stmt.pdf',
  filePath: 'documents/user-123/loan_statements/loan-stmt.pdf',
  fileHash: 'abc',
  documentType: 'loan_statement',
  propertyId: null,
  periodStart: null,
  periodEnd: null,
  uploadedAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListLoanStagedByUser: vi.fn(),
  mockGetDocumentsByUser: vi.fn(),
  mockGroupStagedItemsByDocument: vi.fn(),
  mockPatchLoanStagedItem: vi.fn(),
  mockFindInstallmentLoanById: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  listLoanStagedByUser: (...args: unknown[]) => mocks.mockListLoanStagedByUser(...args),
  getDocumentsByUser: (...args: unknown[]) => mocks.mockGetDocumentsByUser(...args),
  groupStagedItemsByDocument: (...args: unknown[]) => mocks.mockGroupStagedItemsByDocument(...args),
  patchLoanStagedItem: (...args: unknown[]) => mocks.mockPatchLoanStagedItem(...args),
}))

vi.mock('@/lib/borrowings', () => ({
  findInstallmentLoanById: (...args: unknown[]) => mocks.mockFindInstallmentLoanById(...args),
}))

function makePatchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/ingestion/loan-staged/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── GET /api/ingestion/loan-staged ────────────────────────────────────────────

describe('GET /api/ingestion/loan-staged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockListLoanStagedByUser.mockResolvedValue([loanStagingItem])
    mocks.mockGetDocumentsByUser.mockResolvedValue([sourceDoc])
    mocks.mockGroupStagedItemsByDocument.mockReturnValue([
      {
        sourceDocumentId: VALID_DOC_ID,
        documentFileName: 'loan-stmt.pdf',
        items: [loanStagingItem],
      },
    ])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mocks.mockListLoanStagedByUser).not.toHaveBeenCalled()
  })

  it('returns sessions grouped by sourceDocumentId', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessions).toHaveLength(1)
    expect(json.sessions[0].sourceDocumentId).toBe(VALID_DOC_ID)
    expect(json.sessions[0].documentFileName).toBe('loan-stmt.pdf')
    expect(json.sessions[0].items).toHaveLength(1)
  })

  it('returns empty sessions when no staged items', async () => {
    mocks.mockListLoanStagedByUser.mockResolvedValue([])
    mocks.mockGroupStagedItemsByDocument.mockReturnValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessions).toHaveLength(0)
  })

  it('passes userId to listLoanStagedByUser', async () => {
    await GET()
    expect(mocks.mockListLoanStagedByUser).toHaveBeenCalledWith('user-123')
  })

  it('passes userId to getDocumentsByUser', async () => {
    await GET()
    expect(mocks.mockGetDocumentsByUser).toHaveBeenCalledWith('user-123')
  })
})

// ── PATCH /api/ingestion/loan-staged/[id] ─────────────────────────────────────

describe('PATCH /api/ingestion/loan-staged/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockPatchLoanStagedItem.mockResolvedValue({ ...loanStagingItem, status: 'approved' })
    mocks.mockFindInstallmentLoanById.mockResolvedValue({ id: VALID_LOAN_ID })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(401)
    expect(mocks.mockPatchLoanStagedItem).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid UUID id', async () => {
    const res = await PATCH(makePatchRequest('not-a-uuid', { status: 'approved' }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'bad_status' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for installmentLoanId that is not a UUID', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { installmentLoanId: 'not-a-uuid' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when installmentLoanId does not belong to user', async () => {
    mocks.mockFindInstallmentLoanById.mockResolvedValue(null)
    const res = await PATCH(
      makePatchRequest(VALID_ID, { installmentLoanId: VALID_LOAN_ID }),
      { params: Promise.resolve({ id: VALID_ID }) }
    )
    expect(res.status).toBe(400)
    expect(mocks.mockPatchLoanStagedItem).not.toHaveBeenCalled()
  })

  it('returns 404 when item not found or not owned', async () => {
    mocks.mockPatchLoanStagedItem.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(404)
  })

  it('patches status and returns item', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.item).toBeDefined()
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { status: 'approved' })
  })

  it('patches installmentLoanId after ownership check', async () => {
    mocks.mockPatchLoanStagedItem.mockResolvedValue({ ...loanStagingItem, installmentLoanId: VALID_LOAN_ID })
    const res = await PATCH(
      makePatchRequest(VALID_ID, { installmentLoanId: VALID_LOAN_ID }),
      { params: Promise.resolve({ id: VALID_ID }) }
    )
    expect(res.status).toBe(200)
    expect(mocks.mockFindInstallmentLoanById).toHaveBeenCalledWith('user-123', VALID_LOAN_ID)
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(
      VALID_ID,
      'user-123',
      { installmentLoanId: VALID_LOAN_ID }
    )
  })

  it('allows setting installmentLoanId to null', async () => {
    mocks.mockPatchLoanStagedItem.mockResolvedValue({ ...loanStagingItem, installmentLoanId: null })
    const res = await PATCH(
      makePatchRequest(VALID_ID, { installmentLoanId: null }),
      { params: Promise.resolve({ id: VALID_ID }) }
    )
    expect(res.status).toBe(200)
    expect(mocks.mockFindInstallmentLoanById).not.toHaveBeenCalled()
  })

  it('patches interestCents and principalCents', async () => {
    mocks.mockPatchLoanStagedItem.mockResolvedValue({
      ...loanStagingItem,
      interestCents: 80000,
      principalCents: 120000,
    })
    const res = await PATCH(
      makePatchRequest(VALID_ID, { interestCents: 80000, principalCents: 120000 }),
      { params: Promise.resolve({ id: VALID_ID }) }
    )
    expect(res.status).toBe(200)
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(
      VALID_ID,
      'user-123',
      { interestCents: 80000, principalCents: 120000 }
    )
  })
})
