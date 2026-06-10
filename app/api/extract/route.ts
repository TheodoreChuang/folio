import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  extractTextFromPdf,
  classifyDocument,
  extractStatementData,
  extractLoanStatementData,
} from '@/lib/ingestion/extraction/parse'
import type { LoanExtractionResult, ExtractionResult } from '@/lib/ingestion/extraction/schema'
import {
  stageExtractionResult,
  stageLoanExtractionResult,
  countRecentUploads,
  findSourceDocumentById,
  updateSourceDocumentType,
} from '@/lib/ingestion'
import { logger } from '@/lib/logger'
import { captureError } from '@/lib/api-error'

const extractBodySchema = z.object({
  sourceDocumentId: z.string().uuid('Missing or invalid sourceDocumentId'),
})

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const EXTRACT_DAILY_LIMIT = 20
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const count = await countRecentUploads(user.id, oneDayAgo)

  if (count >= EXTRACT_DAILY_LIMIT) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 20 extractions per 24 hours.' },
      { status: 429 }
    )
  }

  const parsed = extractBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    )
  }
  const { sourceDocumentId } = parsed.data

  const doc = await findSourceDocumentById(user.id, sourceDocumentId)
  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error: downloadError } = await supabase.storage
    .from('documents')
    .download(doc.filePath)

  if (downloadError || !data) {
    captureError(downloadError ?? new Error('no data'), { route: 'POST /api/extract', phase: 'storage-download' })
    return NextResponse.json(
      {
        error: 'Storage download failed',
        detail: downloadError?.message ?? undefined,
      },
      { status: 500 }
    )
  }

  let pdfText: string
  try {
    const buffer = Buffer.from(await data.arrayBuffer())
    pdfText = await extractTextFromPdf(buffer)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'PDF text extraction failed'
    if (message.includes('scanned') || message.includes('image-only')) {
      return NextResponse.json(
        { error: message },
        { status: 422 }
      )
    }
    return NextResponse.json(
      { error: 'PDF text extraction failed', detail: message },
      { status: 500 }
    )
  }

  logger.debug('pdf text extracted', { textLength: pdfText.length })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55_000)

  // Skip AI classification if a prior run already determined the document type
  let documentType: 'pm_statement' | 'loan_statement' | 'unknown'
  if (doc.documentType === 'pm_statement' || doc.documentType === 'loan_statement') {
    documentType = doc.documentType as 'pm_statement' | 'loan_statement'
  } else {
    try {
      const classification = await classifyDocument(pdfText, controller.signal)
      documentType = classification.documentType
    } catch (err) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
      }
      captureError(err, { route: 'POST /api/extract', phase: 'classification' })
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: 'Classification failed', detail: message },
        { status: 500 }
      )
    }

    try {
      await updateSourceDocumentType(user.id, sourceDocumentId, documentType)
    } catch (err) {
      clearTimeout(timeoutId)
      captureError(err, { route: 'POST /api/extract', phase: 'type-update' })
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: 'Failed to update document type', detail: message }, { status: 500 })
    }
  }

  if (documentType === 'unknown') {
    clearTimeout(timeoutId)
    return NextResponse.json(
      { error: "Couldn't classify this document — only PM statements and loan statements are supported" },
      { status: 400 }
    )
  }

  if (documentType === 'loan_statement') {
    let loanResult: LoanExtractionResult
    try {
      loanResult = await extractLoanStatementData(pdfText, controller.signal)
    } catch (err) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
      }
      captureError(err, { route: 'POST /api/extract', phase: 'ai-extraction' })
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: 'Extraction failed', detail: message },
        { status: 500 }
      )
    }

    let loanStagedCount: number
    try {
      const staged = await stageLoanExtractionResult(user.id, sourceDocumentId, loanResult)
      loanStagedCount = staged.stagedCount
    } catch (err) {
      clearTimeout(timeoutId)
      captureError(err, { route: 'POST /api/extract', phase: 'staging' })
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: 'Staging failed', detail: message },
        { status: 500 }
      )
    }

    clearTimeout(timeoutId)
    return NextResponse.json({ sourceDocumentId, stagedCount: loanStagedCount })
  }

  if (documentType === 'pm_statement') {
    let result: ExtractionResult
    try {
      result = await extractStatementData(pdfText, controller.signal)
    } catch (err) {
      clearTimeout(timeoutId)
      if (isAbortError(err)) {
        return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
      }
      captureError(err, { route: 'POST /api/extract', phase: 'ai-extraction' })
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        {
          error: 'Extraction failed',
          detail: message,
        },
        { status: 500 }
      )
    }

    let stagedCount: number
    try {
      const staged = await stageExtractionResult(user.id, sourceDocumentId, result)
      stagedCount = staged.stagedCount
    } catch (err) {
      clearTimeout(timeoutId)
      captureError(err, { route: 'POST /api/extract', phase: 'staging' })
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: 'Staging failed', detail: message },
        { status: 500 }
      )
    }

    clearTimeout(timeoutId)
    return NextResponse.json({ sourceDocumentId, stagedCount })
  }

  clearTimeout(timeoutId)
  captureError(new Error(`Unexpected document type: ${documentType}`), { route: 'POST /api/extract' })
  return NextResponse.json({ error: 'Unexpected document type' }, { status: 500 })
}
