import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveUser } from '@/lib/api-auth'
import { logger } from '@/lib/logger'
import { captureError, getStorageStatusCode } from '@/lib/api-error'
import { MAX_UPLOAD_BYTES } from '@/lib/constants'
import { findSourceDocumentByHash, insertSourceDocument, findOwnedSourceDocumentAnyStatus } from '@/lib/ingestion'

const documentTypeSchema = z.enum(['pm_statement', 'loan_statement', 'unknown'])
const uuidSchema = z.string().uuid()

function documentTypeToFolder(documentType: string): string {
  switch (documentType) {
    case 'pm_statement':
      return 'pm_statements'
    case 'loan_statement':
      return 'loan_statements'
    case 'bank_statement':
      return 'bank_statements'
    default:
      return 'documents'
  }
}

export async function POST(request: Request) {
  let resolved: Awaited<ReturnType<typeof resolveUser>>
  try {
    resolved = await resolveUser(request)
  } catch (err) {
    captureError(err, { route: 'POST /api/v1/upload', phase: 'auth' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!resolved) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (resolved.authMethod === 'bearer') {
    return NextResponse.json(
      { error: 'File upload requires session authentication. Use the Folio web app to upload documents.' },
      { status: 400 }
    )
  }
  const userId = resolved.id

  const supabase = await createServerSupabaseClient()

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Invalid form data' },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing file' },
      { status: 400 }
    )
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'File must be application/pdf' },
      { status: 400 }
    )
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'File exceeds 1MB' },
      { status: 413 }
    )
  }

  const rawDocumentType = formData.get('documentType')
  const documentTypeParsed = documentTypeSchema.safeParse(
    typeof rawDocumentType === 'string' && rawDocumentType.trim() !== ''
      ? rawDocumentType.trim()
      : 'unknown'
  )
  if (!documentTypeParsed.success) {
    return NextResponse.json(
      { error: 'Invalid documentType' },
      { status: 400 }
    )
  }
  const documentTypeStr = documentTypeParsed.data

  // Optional Replace (R23) anchor — the confirmed upload this new file supersedes.
  const rawReplaces = formData.get('replacesSourceDocumentId')
  let replacesSourceDocumentId: string | null = null
  if (typeof rawReplaces === 'string' && rawReplaces.trim() !== '') {
    const parsedReplaces = uuidSchema.safeParse(rawReplaces.trim())
    if (!parsedReplaces.success) {
      return NextResponse.json({ error: 'Invalid replacesSourceDocumentId' }, { status: 400 })
    }
    const target = await findOwnedSourceDocumentAnyStatus(userId, parsedReplaces.data)
    if (!target) {
      return NextResponse.json({ error: 'Replace target not found' }, { status: 404 })
    }
    replacesSourceDocumentId = parsedReplaces.data
  }

  const buffer = await file.arrayBuffer()
  const hash = createHash('sha256')
    .update(Buffer.from(buffer))
    .digest('hex')

  const existing = await findSourceDocumentByHash(userId, hash)
  if (existing) {
    return NextResponse.json({
      error: 'This file has already been uploaded.',
      existingUploadId: existing.id,
    }, { status: 409 })
  }

  const folder = documentTypeToFolder(documentTypeStr)
  const filePath = `documents/${userId}/${folder}/${file.name}`

  let uploadError = (await supabase.storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })).error

  if (uploadError && getStorageStatusCode(uploadError) === '409') {
    // The active-hash check already passed, so no active document owns this object —
    // it is an orphan from a prior void/dismiss whose best-effort delete failed (KTD-3).
    // Overwrite it rather than 409-ing a legitimate re-upload.
    logger.debug('storage upload 409 after hash check passed — retrying with upsert')
    uploadError = (await supabase.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })).error
  }

  if (uploadError) {
    captureError(uploadError, { route: 'POST /api/v1/upload', phase: 'storage' })
    return NextResponse.json(
      { error: 'Storage upload failed', detail: uploadError.message ?? String(uploadError) },
      { status: 500 }
    )
  }

  try {
    const doc = await insertSourceDocument({
      userId,
      fileName: file.name,
      fileHash: hash,
      documentType: documentTypeStr,
      filePath,
      replacesSourceDocumentId,
    })

    if (!doc) {
      await supabase.storage.from('documents').remove([filePath])
      return NextResponse.json(
        { error: 'Insert failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      sourceDocumentId: doc.id,
      filePath: doc.filePath,
      isDuplicate: false,
    }, { status: 201 })
  } catch (err) {
    await supabase.storage.from('documents').remove([filePath])

    const isUniqueViolation =
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'

    if (isUniqueViolation) {
      const existingAfterRace = await findSourceDocumentByHash(userId, hash)
      if (existingAfterRace) {
        return NextResponse.json({
          error: 'This file has already been uploaded.',
          existingUploadId: existingAfterRace.id,
        }, { status: 409 })
      }
    }

    captureError(err, { route: 'POST /api/v1/upload' })
    return NextResponse.json(
      {
        error: 'Database insert failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
