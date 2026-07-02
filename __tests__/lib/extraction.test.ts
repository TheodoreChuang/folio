import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractionResultSchema,
  extractedLineItemSchema,
  loanExtractionResultSchema,
  classificationResultSchema,
} from '@/lib/ingestion/extraction/schema'
import {
  extractTextFromPdf,
  classifyDocument,
  extractLoanStatementData,
} from '@/lib/ingestion/extraction/parse'

const validLineItem = {
  lineItemDate: '2026-03-31',
  amountCents: 400000,
  category: 'rent',
  description: 'Rental income',
  confidence: 'high' as const,
}

const validResult = {
  propertyAddress: '123 Smith St, Sydney NSW 2000',
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  lineItems: [validLineItem],
}

describe('extractionResultSchema', () => {
  it('rejects negative amountCents', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      lineItems: [{ ...validLineItem, amountCents: -100 }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      statementPeriodStart: '03/01/2026',
    })
    expect(res.success).toBe(false)
  })

  it('rejects unknown category', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      lineItems: [{ ...validLineItem, category: 'unknown_category' }],
    })
    expect(res.success).toBe(false)
  })

  it('accepts an empty lineItems array (R22: zero-transaction statement is valid)', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      lineItems: [],
    })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.lineItems).toHaveLength(0)
  })

  it('accepts valid complete object', () => {
    const res = extractionResultSchema.safeParse(validResult)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.propertyAddress).toBe(validResult.propertyAddress)
      expect(res.data.lineItems).toHaveLength(1)
    }
  })
})

describe('extractedLineItemSchema', () => {
  it('rejects negative amountCents', () => {
    const res = extractedLineItemSchema.safeParse({
      ...validLineItem,
      amountCents: -1,
    })
    expect(res.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const res = extractedLineItemSchema.safeParse({
      ...validLineItem,
      lineItemDate: '31-03-2026',
    })
    expect(res.success).toBe(false)
  })
})

const mockGenerateObject = vi.hoisted(() => vi.fn())
vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
  createGateway: () => (model: string) => model,
}))

const mockExtractText = vi.hoisted(() => vi.fn())
vi.mock('unpdf', () => ({
  extractText: mockExtractText,
}))

describe('classificationResultSchema', () => {
  it('accepts valid pm_statement', () => {
    const res = classificationResultSchema.safeParse({ documentType: 'pm_statement', confidence: 'high' })
    expect(res.success).toBe(true)
  })

  it('accepts loan_statement and unknown', () => {
    expect(classificationResultSchema.safeParse({ documentType: 'loan_statement', confidence: 'medium' }).success).toBe(true)
    expect(classificationResultSchema.safeParse({ documentType: 'unknown', confidence: 'low' }).success).toBe(true)
  })

  it('rejects invalid documentType', () => {
    expect(classificationResultSchema.safeParse({ documentType: 'bank_statement', confidence: 'high' }).success).toBe(false)
  })

  it('defaults statementScope to periodic when omitted', () => {
    const res = classificationResultSchema.safeParse({ documentType: 'pm_statement', confidence: 'high' })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.statementScope).toBe('periodic')
  })

  it('accepts an explicit annual_summary statementScope', () => {
    const res = classificationResultSchema.safeParse({ documentType: 'pm_statement', statementScope: 'annual_summary', confidence: 'high' })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.statementScope).toBe('annual_summary')
  })
})

describe('classifyDocument', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns pm_statement for PM statement signals', async () => {
    mockGenerateObject.mockResolvedValue({ object: { documentType: 'pm_statement', confidence: 'high' } })
    const result = await classifyDocument('Rental income March 2026 property management')
    expect(result.documentType).toBe('pm_statement')
  })

  it('returns loan_statement for loan statement signals', async () => {
    mockGenerateObject.mockResolvedValue({ object: { documentType: 'loan_statement', confidence: 'high' } })
    const result = await classifyDocument('Home loan repayment interest principal outstanding balance')
    expect(result.documentType).toBe('loan_statement')
  })

  it('returns unknown for unrecognisable text', async () => {
    mockGenerateObject.mockResolvedValue({ object: { documentType: 'unknown', confidence: 'low' } })
    const result = await classifyDocument('some random text that is not a financial document')
    expect(result.documentType).toBe('unknown')
  })

  it('system prompt references property management and loan statement', async () => {
    mockGenerateObject.mockResolvedValue({ object: { documentType: 'pm_statement', confidence: 'high' } })
    await classifyDocument('text')
    const callArgs = mockGenerateObject.mock.calls[0][0]
    expect(callArgs.system).toContain('property management')
    expect(callArgs.system).toContain('loan statement')
  })
})

describe('loanExtractionResultSchema', () => {
  const validPayment = {
    paymentDate: '2026-03-01',
    amountCents: 250000,
    confidence: 'high' as const,
  }

  const validResult = {
    lenderName: 'Commonwealth Bank',
    statementPeriodStart: '2026-03-01',
    statementPeriodEnd: '2026-03-31',
    closingBalanceCents: 45000000,
    payments: [validPayment],
  }

  it('accepts a valid loan extraction result', () => {
    const res = loanExtractionResultSchema.safeParse(validResult)
    expect(res.success).toBe(true)
  })

  it('accepts empty payments array', () => {
    const res = loanExtractionResultSchema.safeParse({ ...validResult, payments: [] })
    expect(res.success).toBe(true)
  })

  it('accepts payments without optional interestCents/principalCents', () => {
    const res = loanExtractionResultSchema.safeParse(validResult)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.payments[0].interestCents).toBeUndefined()
    }
  })

  it('rejects missing required paymentDate on a payment', () => {
    const { paymentDate: _pd, ...paymentWithoutDate } = validPayment
    const res = loanExtractionResultSchema.safeParse({
      ...validResult,
      payments: [paymentWithoutDate],
    })
    expect(res.success).toBe(false)
  })

  it('rejects negative amountCents', () => {
    const res = loanExtractionResultSchema.safeParse({
      ...validResult,
      payments: [{ ...validPayment, amountCents: -100 }],
    })
    expect(res.success).toBe(false)
  })
})

describe('extractLoanStatementData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns typed LoanExtractionResult from mocked generateObject', async () => {
    const mockResult = {
      lenderName: 'ANZ',
      statementPeriodStart: '2026-03-01',
      statementPeriodEnd: '2026-03-31',
      closingBalanceCents: 45000000,
      payments: [{ paymentDate: '2026-03-15', amountCents: 250000, interestCents: 150000, principalCents: 100000, confidence: 'high' }],
    }
    mockGenerateObject.mockResolvedValue({ object: mockResult })
    const result = await extractLoanStatementData('ANZ loan statement text')
    expect(result.lenderName).toBe('ANZ')
    expect(result.payments).toHaveLength(1)
    expect(result.payments[0].interestCents).toBe(150000)
    expect(result.payments[0].principalCents).toBe(100000)
  })

  it('system prompt references interest, principal, and closing balance', async () => {
    mockGenerateObject.mockResolvedValue({
      object: { lenderName: 'ANZ', statementPeriodStart: '2026-03-01', statementPeriodEnd: '2026-03-31', closingBalanceCents: 0, payments: [] },
    })
    await extractLoanStatementData('text')
    const callArgs = mockGenerateObject.mock.calls[0][0]
    expect(callArgs.system).toContain('interest')
    expect(callArgs.system).toContain('principal')
    expect(callArgs.system).toContain('closing')
  })
})

describe('extractTextFromPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws on empty text', async () => {
    mockExtractText.mockResolvedValue({ totalPages: 1, text: '' })
    await expect(
      extractTextFromPdf(Buffer.from('fake'))
    ).rejects.toThrow('scanned or image-only')
  })

  it('throws on text under 50 chars', async () => {
    mockExtractText.mockResolvedValue({ totalPages: 1, text: 'short' })
    await expect(
      extractTextFromPdf(Buffer.from('fake'))
    ).rejects.toThrow('scanned or image-only')
  })

  it('returns trimmed text on success', async () => {
    const longText = 'A'.repeat(60)
    mockExtractText.mockResolvedValue({ totalPages: 1, text: `  ${longText}  ` })
    const result = await extractTextFromPdf(Buffer.from('fake'))
    expect(result).toBe(longText)
  })
})
