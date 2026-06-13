import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/v1/ingestion/loan-staged/route'
import { PATCH } from '@/app/api/v1/ingestion/loan-staged/[id]/route'

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
  interestCents: 80000,
  principalCents: 170000,
  description: 'Loan repayment',
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
  mockPatchLoanStagedItem: vi.fn(),
  mockFindInstallmentLoanById: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/ingestion', async () => {
  const { groupStagedItemsByDocument } = await import('@/lib/ingestion/utils')
  return {
    listLoanStagedByUser: (...args: unknown[]) => mocks.mockListLoanStagedByUser(...args),
    getDocumentsByUser: (...args: unknown[]) => mocks.mockGetDocumentsByUser(...args),
    patchLoanStagedItem: (...args: unknown[]) => mocks.mockPatchLoanStagedItem(...args),
    groupStagedItemsByDocument,
  }
})

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
    expect(json.sessions[0].items[0].amountCents).toBe(250000)
  })

  it('returns empty sessions when no staging items exist', async () => {
    mocks.mockListLoanStagedByUser.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessions).toHaveLength(0)
  })

  it('groups multiple items under same session', async () => {
    const secondItem = { ...loanStagingItem, id: 'd4e5f6a7-b8c9-4012-d345-444444444444', lineItemIndex: 1 }
    mocks.mockListLoanStagedByUser.mockResolvedValue([loanStagingItem, secondItem])
    const res = await GET()
    const json = await res.json()
    expect(json.sessions).toHaveLength(1)
    expect(json.sessions[0].items).toHaveLength(2)
  })

  it('produces two sessions for items from two distinct sourceDocumentIds', async () => {
    const secondDocId = 'e5f6a7b8-c9d0-4123-e456-555555555555'
    const secondDocItem = { ...loanStagingItem, id: 'f6a7b8c9-d0e1-4234-f567-666666666666', sourceDocumentId: secondDocId }
    const secondDoc = { ...sourceDoc, id: secondDocId, fileName: 'loan-stmt-2.pdf' }
    mocks.mockListLoanStagedByUser.mockResolvedValue([loanStagingItem, secondDocItem])
    mocks.mockGetDocumentsByUser.mockResolvedValue([sourceDoc, secondDoc])
    const res = await GET()
    const json = await res.json()
    expect(json.sessions).toHaveLength(2)
    const docIds = json.sessions.map((s: { sourceDocumentId: string }) => s.sourceDocumentId)
    expect(docIds).toContain(VALID_DOC_ID)
    expect(docIds).toContain(secondDocId)
  })

  it('does not return sessions belonging to other users', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } } })
    mocks.mockListLoanStagedByUser.mockResolvedValue([])
    const res = await GET()
    const json = await res.json()
    expect(json.sessions).toHaveLength(0)
    expect(mocks.mockListLoanStagedByUser).toHaveBeenCalledWith('other-user')
  })

  it('uses Unknown filename when doc not found in map', async () => {
    mocks.mockGetDocumentsByUser.mockResolvedValue([])
    const res = await GET()
    const json = await res.json()
    expect(json.sessions[0].documentFileName).toBe('Unknown')
  })

  it('passes userId to listLoanStagedByUser', async () => {
    await GET()
    expect(mocks.mockListLoanStagedByUser).toHaveBeenCalledWith('user-123')
  })
})

// ── PATCH /api/ingestion/loan-staged/[id] ────────────────────────────────────

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
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'invalid_status' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid installmentLoanId format', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { installmentLoanId: 'not-a-uuid' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when item not found or not owned by another user', async () => {
    mocks.mockPatchLoanStagedItem.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(404)
  })

  it('sets installmentLoanId and returns updated item', async () => {
    const patchedItem = { ...loanStagingItem, installmentLoanId: VALID_LOAN_ID }
    mocks.mockPatchLoanStagedItem.mockResolvedValue(patchedItem)
    const res = await PATCH(makePatchRequest(VALID_ID, { installmentLoanId: VALID_LOAN_ID }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.item.installmentLoanId).toBe(VALID_LOAN_ID)
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { installmentLoanId: VALID_LOAN_ID })
  })

  it('sets status to approved and returns updated item', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.item).toBeDefined()
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { status: 'approved' })
  })

  it('returns 400 when installmentLoanId belongs to another user', async () => {
    mocks.mockFindInstallmentLoanById.mockResolvedValue(undefined)
    const res = await PATCH(makePatchRequest(VALID_ID, { installmentLoanId: VALID_LOAN_ID }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
    expect(mocks.mockPatchLoanStagedItem).not.toHaveBeenCalled()
  })

  it('allows setting installmentLoanId to null', async () => {
    mocks.mockPatchLoanStagedItem.mockResolvedValue({ ...loanStagingItem, installmentLoanId: null })
    const res = await PATCH(makePatchRequest(VALID_ID, { installmentLoanId: null }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { installmentLoanId: null })
  })

  it('sets interestCents and returns updated item', async () => {
    const patchedItem = { ...loanStagingItem, interestCents: 90000 }
    mocks.mockPatchLoanStagedItem.mockResolvedValue(patchedItem)
    const res = await PATCH(makePatchRequest(VALID_ID, { interestCents: 90000 }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { interestCents: 90000 })
  })

  it('sets principalCents and returns updated item', async () => {
    const patchedItem = { ...loanStagingItem, principalCents: 160000 }
    mocks.mockPatchLoanStagedItem.mockResolvedValue(patchedItem)
    const res = await PATCH(makePatchRequest(VALID_ID, { principalCents: 160000 }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { principalCents: 160000 })
  })

  it('allows setting interestCents to null', async () => {
    mocks.mockPatchLoanStagedItem.mockResolvedValue({ ...loanStagingItem, interestCents: null })
    const res = await PATCH(makePatchRequest(VALID_ID, { interestCents: null }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    expect(mocks.mockPatchLoanStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { interestCents: null })
  })

  it('returns 400 for negative interestCents', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { interestCents: -100 }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
    expect(mocks.mockPatchLoanStagedItem).not.toHaveBeenCalled()
  })

  it('returns 400 for non-integer principalCents', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { principalCents: 1.5 }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
    expect(mocks.mockPatchLoanStagedItem).not.toHaveBeenCalled()
  })
})
