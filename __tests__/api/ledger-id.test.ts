import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE, PATCH } from '@/app/api/v1/ledger/[id]/route'

const manualEntry = {
  id: 'e1111111-1111-4111-a111-111111111111',
  userId: 'user-123',
  propertyId: 'prop-uuid-aaaa-bbbb-cccc-dddddddddddd',
  sourceDocumentId: null,
  installmentLoanId: null,
  lineItemDate: '2026-03-15',
  amountCents: 120000,
  category: 'insurance',
  description: 'Building insurance',
  userNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const extractedEntry = {
  ...manualEntry,
  id: 'e2222222-2222-4222-a222-222222222222',
  sourceDocumentId: 'doc-uuid-aaaa-bbbb-cccc-222222222222',
}

const VALID_ENTRY_ID = manualEntry.id

function makeDeleteRequest(entryId: string) {
  return new Request(`http://localhost/api/ledger/${entryId}`, { method: 'DELETE' })
}

function makePatchRequest(entryId: string, body: unknown) {
  return new Request(`http://localhost/api/ledger/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFetchLedgerEntryForDelete: vi.fn(),
  mockSoftDeleteLedgerEntry: vi.fn(),
  mockCorrectLedgerEntry: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/aggregate', () => ({
  findLedgerEntryById: mocks.mockFetchLedgerEntryForDelete,
  deleteLedgerEntry: mocks.mockSoftDeleteLedgerEntry,
  correctLedgerEntry: mocks.mockCorrectLedgerEntry,
}))

describe('DELETE /api/ledger/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFetchLedgerEntryForDelete.mockResolvedValue(manualEntry)
    mocks.mockSoftDeleteLedgerEntry.mockResolvedValue({ ...manualEntry, deletedAt: new Date() })
    mocks.mockCorrectLedgerEntry.mockResolvedValue({ ...manualEntry, id: 'new-entry-id' })
  })

  it('returns 200 with success on successful soft-delete', async () => {
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(401)
    expect(mocks.mockSoftDeleteLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 404 for invalid UUID (does not leak existence)', async () => {
    const res = await DELETE(makeDeleteRequest('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(404)
    expect(mocks.mockFetchLedgerEntryForDelete).not.toHaveBeenCalled()
    expect(mocks.mockSoftDeleteLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 404 when entry does not exist', async () => {
    mocks.mockFetchLedgerEntryForDelete.mockResolvedValueOnce(undefined)
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockSoftDeleteLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 404 when entry belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockFetchLedgerEntryForDelete.mockResolvedValueOnce(undefined)
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockSoftDeleteLedgerEntry).not.toHaveBeenCalled()
  })

  it('now deletes a source-document-linked entry (403 guard removed, R10)', async () => {
    mocks.mockFetchLedgerEntryForDelete.mockResolvedValueOnce(extractedEntry)
    const res = await DELETE(makeDeleteRequest(extractedEntry.id), { params: Promise.resolve({ id: extractedEntry.id }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(mocks.mockSoftDeleteLedgerEntry).toHaveBeenCalledWith('user-123', extractedEntry.id)
  })

  it('passes userId from auth session to findLedgerEntryById', async () => {
    await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(mocks.mockFetchLedgerEntryForDelete).toHaveBeenCalledWith('user-123', VALID_ENTRY_ID)
  })

  it('passes userId from auth session to deleteLedgerEntry', async () => {
    await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(mocks.mockSoftDeleteLedgerEntry).toHaveBeenCalledWith('user-123', VALID_ENTRY_ID)
  })
})

describe('PATCH /api/ledger/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockCorrectLedgerEntry.mockResolvedValue({ ...manualEntry, id: 'new-entry-id', category: 'repairs' })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatchRequest(VALID_ENTRY_ID, { category: 'repairs' }), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(401)
    expect(mocks.mockCorrectLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 404 for an invalid UUID', async () => {
    const res = await PATCH(makePatchRequest('not-a-uuid', { category: 'repairs' }), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(404)
    expect(mocks.mockCorrectLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 400 when no fields are supplied', async () => {
    const res = await PATCH(makePatchRequest(VALID_ENTRY_ID, {}), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(400)
    expect(mocks.mockCorrectLedgerEntry).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-positive amountCents', async () => {
    const res = await PATCH(makePatchRequest(VALID_ENTRY_ID, { amountCents: -5 }), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed lineItemDate', async () => {
    const res = await PATCH(makePatchRequest(VALID_ENTRY_ID, { lineItemDate: '03/15/2026' }), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the entry is not found or not owned', async () => {
    mocks.mockCorrectLedgerEntry.mockResolvedValueOnce(null)
    const res = await PATCH(makePatchRequest(VALID_ENTRY_ID, { category: 'repairs' }), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with the new (corrected) row and passes userId + patch to the repo', async () => {
    const res = await PATCH(makePatchRequest(VALID_ENTRY_ID, { category: 'repairs', amountCents: 99900 }), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entry.id).toBe('new-entry-id')
    expect(mocks.mockCorrectLedgerEntry).toHaveBeenCalledWith('user-123', VALID_ENTRY_ID, { category: 'repairs', amountCents: 99900 })
  })
})
