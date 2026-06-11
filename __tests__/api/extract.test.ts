import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/extract/route'

const docRow = {
  id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
  userId: 'user-123',
  fileName: 'stmt.pdf',
  filePath: 'documents/user-123/pm_statements/stmt.pdf',
  fileHash: 'abc',
  documentType: 'unknown',
  uploadedAt: new Date(),
}

const sampleResult = {
  propertyAddress: '123 Smith St, Sydney NSW 2000',
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  lineItems: [
    {
      lineItemDate: '2026-03-31',
      amountCents: 400000,
      category: 'rent',
      description: 'Rental income March 2026',
      confidence: 'high' as const,
    },
  ],
}

const loanResult = {
  lenderName: 'ANZ',
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  closingBalanceCents: 45000000,
  payments: [
    { paymentDate: '2026-03-15', amountCents: 250000, confidence: 'high' as const },
  ],
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockDownload: vi.fn(),
  mockCountRecentUploads: vi.fn(),
  mockFindSourceDocumentById: vi.fn(),
  mockUpdateSourceDocumentType: vi.fn(),
  mockExtractTextFromPdf: vi.fn(),
  mockClassifyDocument: vi.fn(),
  mockExtractStatementData: vi.fn(),
  mockExtractLoanStatementData: vi.fn(),
  mockStageExtractionResult: vi.fn(),
  mockStageLoanExtractionResult: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
      storage: {
        from: () => ({
          download: mocks.mockDownload,
        }),
      },
    })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  countRecentUploads: (...args: unknown[]) => mocks.mockCountRecentUploads(...args),
  findSourceDocumentById: (...args: unknown[]) => mocks.mockFindSourceDocumentById(...args),
  updateSourceDocumentType: (...args: unknown[]) => mocks.mockUpdateSourceDocumentType(...args),
  stageExtractionResult: (...args: unknown[]) => mocks.mockStageExtractionResult(...args),
  stageLoanExtractionResult: (...args: unknown[]) => mocks.mockStageLoanExtractionResult(...args),
}))

vi.mock('@/lib/ingestion/extraction/parse', () => ({
  extractTextFromPdf: (...args: unknown[]) => mocks.mockExtractTextFromPdf(...args),
  classifyDocument: (...args: unknown[]) => mocks.mockClassifyDocument(...args),
  extractStatementData: (...args: unknown[]) => mocks.mockExtractStatementData(...args),
  extractLoanStatementData: (...args: unknown[]) => mocks.mockExtractLoanStatementData(...args),
}))

describe('POST /api/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mocks.mockCountRecentUploads.mockResolvedValue(0)
    mocks.mockFindSourceDocumentById.mockResolvedValue(docRow)
    mocks.mockUpdateSourceDocumentType.mockResolvedValue(undefined)
    mocks.mockDownload.mockResolvedValue({
      data: new Blob(['fake pdf bytes']),
      error: null,
    })
    mocks.mockExtractTextFromPdf.mockResolvedValue('Extracted PDF text content here.')
    mocks.mockClassifyDocument.mockResolvedValue({ documentType: 'pm_statement', confidence: 'high' })
    mocks.mockExtractStatementData.mockResolvedValue(sampleResult)
    mocks.mockExtractLoanStatementData.mockResolvedValue(loanResult)
    mocks.mockStageExtractionResult.mockResolvedValue({ stagedCount: 1 })
    mocks.mockStageLoanExtractionResult.mockResolvedValue({ stagedCount: 1 })
  })

  it('rejects unauthenticated requests (401)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(401)
    expect(mocks.mockExtractTextFromPdf).not.toHaveBeenCalled()
  })

  it('rejects missing sourceDocumentId (400)', async () => {
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when sourceDocumentId not found', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue(null)
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(404)
    expect(mocks.mockDownload).not.toHaveBeenCalled()
  })

  it('returns 404 when sourceDocument belongs to another user', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue(null)
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(404)
  })

  it('calls findSourceDocumentById with userId from session', async () => {
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(mocks.mockFindSourceDocumentById).toHaveBeenCalledWith('user-123', docRow.id)
  })

  it('returns 422 when PDF text is too short (scanned PDF)', async () => {
    mocks.mockExtractTextFromPdf.mockRejectedValue(
      new Error('PDF appears to be scanned or image-only — no extractable text found')
    )
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(422)
  })

  it('returns 500 when classification fails', async () => {
    mocks.mockClassifyDocument.mockRejectedValue(new Error('LLM unavailable'))
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/classification failed/i)
  })

  it('returns 400 when document cannot be classified (unknown type)', async () => {
    mocks.mockClassifyDocument.mockResolvedValue({ documentType: 'unknown', confidence: 'low' })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/couldn't classify/i)
    expect(mocks.mockExtractStatementData).not.toHaveBeenCalled()
    expect(mocks.mockExtractLoanStatementData).not.toHaveBeenCalled()
  })

  it('calls updateSourceDocumentType with correct args after classification', async () => {
    mocks.mockClassifyDocument.mockResolvedValue({ documentType: 'loan_statement', confidence: 'high' })
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(mocks.mockUpdateSourceDocumentType).toHaveBeenCalledWith('user-123', docRow.id, 'loan_statement')
  })

  it('skips classification when document already has a definitive type', async () => {
    mocks.mockFindSourceDocumentById.mockResolvedValue({ ...docRow, documentType: 'pm_statement' })
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(mocks.mockClassifyDocument).not.toHaveBeenCalled()
    expect(mocks.mockExtractStatementData).toHaveBeenCalled()
  })

  it('routes to loan extraction path when classified as loan_statement', async () => {
    mocks.mockClassifyDocument.mockResolvedValue({ documentType: 'loan_statement', confidence: 'high' })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(200)
    expect(mocks.mockExtractLoanStatementData).toHaveBeenCalledWith('Extracted PDF text content here.', expect.any(AbortSignal))
    expect(mocks.mockStageLoanExtractionResult).toHaveBeenCalledWith('user-123', docRow.id, loanResult)
    expect(mocks.mockExtractStatementData).not.toHaveBeenCalled()
    const json = await res.json()
    expect(json.sourceDocumentId).toBe(docRow.id)
    expect(json.stagedCount).toBe(1)
  })

  it('routes to PM extraction path when classified as pm_statement (regression)', async () => {
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(200)
    expect(mocks.mockExtractStatementData).toHaveBeenCalled()
    expect(mocks.mockStageExtractionResult).toHaveBeenCalledWith('user-123', docRow.id, sampleResult)
    expect(mocks.mockExtractLoanStatementData).not.toHaveBeenCalled()
  })

  it('returns 500 when extractStatementData throws', async () => {
    mocks.mockExtractStatementData.mockRejectedValue(new Error('LLM failed'))
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(500)
  })

  it('returns 500 when extractLoanStatementData throws', async () => {
    mocks.mockClassifyDocument.mockResolvedValue({ documentType: 'loan_statement', confidence: 'high' })
    mocks.mockExtractLoanStatementData.mockRejectedValue(new Error('LLM failed'))
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/extraction failed/i)
  })

  it('returns sourceDocumentId and stagedCount on PM success', async () => {
    mocks.mockStageExtractionResult.mockResolvedValue({ stagedCount: 1 })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sourceDocumentId).toBe(docRow.id)
    expect(json.stagedCount).toBe(1)
    expect(json.result).toBeUndefined()
  })

  it('returns sourceDocumentId and stagedCount on loan success', async () => {
    mocks.mockClassifyDocument.mockResolvedValue({ documentType: 'loan_statement', confidence: 'high' })
    mocks.mockStageLoanExtractionResult.mockResolvedValue({ stagedCount: 2 })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sourceDocumentId).toBe(docRow.id)
    expect(json.stagedCount).toBe(2)
  })

  it('calls stageExtractionResult with correct args (PM)', async () => {
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(mocks.mockStageExtractionResult).toHaveBeenCalledWith(
      'user-123',
      docRow.id,
      sampleResult,
    )
  })

  it('returns 500 when PM staging fails', async () => {
    mocks.mockStageExtractionResult.mockRejectedValue(new Error('DB insert failed'))
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/staging failed/i)
  })

  it('returns 500 when loan staging fails', async () => {
    mocks.mockClassifyDocument.mockResolvedValue({ documentType: 'loan_statement', confidence: 'high' })
    mocks.mockStageLoanExtractionResult.mockRejectedValue(new Error('DB insert failed'))
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/staging failed/i)
  })

  it('returns 429 when upload count is at the daily limit (count >= 20)', async () => {
    mocks.mockCountRecentUploads.mockResolvedValue(20)
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.error).toMatch(/rate limit/i)
    expect(mocks.mockExtractTextFromPdf).not.toHaveBeenCalled()
  })

  it('does NOT rate limit when count is below 20 (count = 19)', async () => {
    mocks.mockCountRecentUploads.mockResolvedValue(19)
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(200)
    expect(mocks.mockExtractTextFromPdf).toHaveBeenCalled()
  })

  it('rate limit check passes userId and a 24h window to countRecentUploads', async () => {
    mocks.mockCountRecentUploads.mockResolvedValue(0)
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000)
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(mocks.mockCountRecentUploads).toHaveBeenCalledWith('user-123', expect.any(Date))
    const sinceArg: Date = mocks.mockCountRecentUploads.mock.calls[0][1]
    expect(sinceArg.getTime()).toBeGreaterThan(before.getTime())
  })
})
