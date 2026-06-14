import { NextResponse } from 'next/server'
import { deleteInstallmentLoanBalance } from '@/lib/borrowings'
import { resolveUser } from '@/lib/api-auth'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; loanId: string; balanceId: string }> }
) {
  try {
    const user = await resolveUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, loanId, balanceId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(balanceId)) {
      return NextResponse.json({ error: 'Invalid balance ID' }, { status: 400 })
    }

    const deleted = await deleteInstallmentLoanBalance(user.id, loanId, balanceId)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/v1/properties/[id]/loans/[loanId]/balances/[balanceId]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
