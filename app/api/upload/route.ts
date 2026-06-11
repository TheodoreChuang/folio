import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { captureError, getStorageStatusCode } from '@/lib/api-error'
import { MAX_UPLOAD_BYTES } from '@/lib/constants'
import { findSourceDocumentByHash, insertSourceDocument } from '@/lib/ingestion'

const documentTypeSchema = z.enum(['pm_statement', 'loan_statement', 'unknown'])

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
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id

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

  const buffer = await file.arrayBuffer()
  const hash = createHash('sha256')
    .update(Buffer.from(buffer))
    .digest('hex')

  const existing = await findSourceDocumentByHash(userId, hash)
  if (existing) {
    return NextResponse.json({
      sourceDocumentId: existing.id,
      filePath: existing.filePath,
      isDuplicate: true,
    })
  }

  const folder = documentTypeToFolder(documentTypeStr)
  const filePath = `documents/${userId}/${folder}/${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    const statusCode = getStorageStatusCode(uploadError)
    logger.debug('storage upload failed', { statusCode })
    if (statusCode === '409') {
      return NextResponse.json(
        { error: 'File already uploaded' },
        { status: 409 }
      )
    }

    captureError(uploadError, { route: 'POST /api/upload', phase: 'storage' })
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
          sourceDocumentId: existingAfterRace.id,
          filePath: existingAfterRace.filePath,
          isDuplicate: true,
        })
      }
    }

    captureError(err, { route: 'POST /api/upload' })
    return NextResponse.json(
      {
        error: 'Database insert failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
