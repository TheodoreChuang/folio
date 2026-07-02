import { generateObject, createGateway } from 'ai'
import { extractText } from 'unpdf'
import type { ExtractionResult, LoanExtractionResult, ClassificationResult } from './schema'
import { extractionResultSchema, loanExtractionResultSchema, classificationResultSchema } from './schema'

const gateway = createGateway()

const MIN_EXTRACTABLE_TEXT_LENGTH = 50

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })

  if (!text || text.trim().length < MIN_EXTRACTABLE_TEXT_LENGTH) {
    throw new Error(
      'PDF appears to be scanned or image-only — no extractable text found'
    )
  }

  return text.trim()
}

export async function classifyDocument(
  pdfText: string,
  signal?: AbortSignal,
): Promise<ClassificationResult> {
  const { object } = await generateObject({
    model: gateway('anthropic/claude-haiku-4-5'),
    schema: classificationResultSchema,
    system: `You are classifying Australian financial documents.
Classify documentType as one of:
- "pm_statement": an Australian property management statement (rent, expenses, PM fees)
- "loan_statement": a mortgage or home loan statement showing loan payments and interest
- "unknown": neither of the above, or insufficient text to determine

Return "unknown" when confidence is insufficient — do not guess.

Also determine statementScope (independent of documentType):
- "periodic": a statement covering a single period such as a month or quarter — the normal case
- "annual_summary": an end-of-financial-year (EOFY) or annual summary that aggregates a full year (or many periods) of transactions into one document

Default to "periodic" unless the document clearly presents itself as an annual or financial-year summary.`,
    prompt: `Classify this document:\n\n${pdfText}`,
    abortSignal: signal,
  })

  return object
}

export async function extractLoanStatementData(
  pdfText: string,
  signal?: AbortSignal,
): Promise<LoanExtractionResult> {
  const { object } = await generateObject({
    model: gateway('anthropic/claude-haiku-4-5'),
    schema: loanExtractionResultSchema,
    system: `You are extracting structured financial data from Australian mortgage or home loan bank statements.
Rules:
- Extract every payment transaction in the statement period
- amountCents: total payment amount in integer cents (always positive)
- interestCents: interest component in integer cents if visible, omit if not shown
- principalCents: principal component in integer cents if visible, omit if not shown
- closingBalanceCents: the end-of-statement outstanding loan balance in integer cents
- All dates must be in YYYY-MM-DD format
- An empty payments array is valid for a statement with no transactions in the period
- confidence: rate high if unambiguous, medium if inferred, low if uncertain`,
    prompt: `Extract all payment data from this loan statement:\n\n${pdfText}`,
    abortSignal: signal,
  })

  return object
}

export async function extractStatementData(
  pdfText: string,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const { object } = await generateObject({
    model: gateway('anthropic/claude-haiku-4-5'),
    schema: extractionResultSchema,
    system: `You are extracting structured financial data from Australian property management statements.
Rules:
- Extract every line item — do not summarise, aggregate, drop, or skip any transaction. Every money movement on the statement must produce a line item.
- amountCents: convert dollar amounts to integer cents (e.g. $1,234.56 → 123456). Always positive.
- category: classify each line item by DIRECTION OF MONEY FLOW first, then by type:
  - Money received by the owner (credits, income): use 'rent' for rental income, 'other_income' for genuine operating income credited to the owner (e.g. tenant water usage reimbursements, lease break fees, late payment fees). Do NOT use 'other_income' for loan advances, bond refunds held in trust, or pass-through disbursements.
  - Money paid out by the owner (debits, expenses): use 'insurance', 'rates', 'repairs', 'property_management', 'utilities', 'strata_fees', or 'other_expense'
  - A line item with the same keyword (e.g. "water") can be either income or expense depending on direction — always check whether it is a payment made or a reimbursement received
  - CATCH-ALL: never drop a line because its type is unrecognised. If it does not fit a specific category, fall back by direction — 'other_income' for money received by the owner, 'other_expense' for money paid out. Set confidence to 'low' for these.
  - If the direction of money flow cannot be determined, use 'other_expense' as the default
- confidence: rate 'high' if amount and category are unambiguous, 'medium' if inferred, 'low' if uncertain
- lineItemDate: use the transaction date shown. If only a period is shown, use the period end date.
- If the statement has no transactions in the period, return an empty lineItems array — this is valid.
- If a field is missing from the statement, make your best inference and set confidence to 'low'`,
    prompt: `Extract all line items from this statement:\n\n${pdfText}`,
    abortSignal: signal,
  })

  return object
}
