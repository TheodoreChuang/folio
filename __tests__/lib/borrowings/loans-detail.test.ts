import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findInstallmentLoanDetail,
  updateInstallmentLoanById,
} from '@/lib/borrowings/repositories/loans'

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const LOAN_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const loanRow = {
  id:           LOAN_ID,
  userId:       'user-123',
  propertyId:   PROP_ID,
  lender:       'Westpac',
  nickname:     'Investment loan',
  startDate:    '2020-01-01',
  endDate:      '2050-01-01',
  entityId:     null,
  loanType:     null,
  ioEndDate:    null,
  interestRate: null,
  createdAt:    new Date(),
}

const balanceRow = {
  id:                'e5f6a7b8-c9d0-4123-e456-555555555555',
  userId:            'user-123',
  installmentLoanId: LOAN_ID,
  balanceCents:      61500000,
  recordedAt:        '2026-04-01',
  notes:             null,
  createdAt:         new Date(),
}

// Each test controls its own mock — no global selectCallCount needed.
// findInstallmentLoanDetail makes 2 sequential db.select calls;
// updateInstallmentLoanById uses db.update.
let selectCallCount = 0

const mocks = vi.hoisted(() => ({
  mockLoanJoinLimit:    vi.fn(),
  mockBalanceOrderLimit: vi.fn(),
  mockUpdateReturning:  vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      selectCallCount++
      const call = selectCallCount
      return {
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: mocks.mockLoanJoinLimit,
            }),
          }),
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: call === 1 ? mocks.mockLoanJoinLimit : mocks.mockBalanceOrderLimit,
            }),
          }),
        }),
      }
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mocks.mockUpdateReturning,
        }),
      }),
    }),
  },
}))

// ── findInstallmentLoanDetail ─────────────────────────────────────────────────

describe('findInstallmentLoanDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockLoanJoinLimit.mockResolvedValue([
      { ...loanRow, propertyAddress: '123 Elm St' },
    ])
    mocks.mockBalanceOrderLimit.mockResolvedValue([balanceRow])
  })

  it('returns loan with propertyAddress from the linked property (nickname preferred)', async () => {
    mocks.mockLoanJoinLimit.mockResolvedValue([
      { ...loanRow, propertyAddress: 'My Investment' },
    ])
    const result = await findInstallmentLoanDetail('user-123', LOAN_ID)
    expect(result).toBeDefined()
    expect(result!.id).toBe(LOAN_ID)
    expect(result!.propertyAddress).toBe('My Investment')
  })

  it('returns propertyAddress: null when propertyId is null (unsecured loan)', async () => {
    mocks.mockLoanJoinLimit.mockResolvedValue([
      { ...loanRow, propertyId: null, propertyAddress: null },
    ])
    const result = await findInstallmentLoanDetail('user-123', LOAN_ID)
    expect(result!.propertyAddress).toBeNull()
  })

  it('returns latestBalance from the most recent balance snapshot', async () => {
    const result = await findInstallmentLoanDetail('user-123', LOAN_ID)
    expect(result!.latestBalance).toMatchObject({
      balanceCents: 61500000,
      recordedAt:   '2026-04-01',
    })
  })

  it('returns latestBalance: null when no snapshots exist', async () => {
    mocks.mockBalanceOrderLimit.mockResolvedValue([])
    const result = await findInstallmentLoanDetail('user-123', LOAN_ID)
    expect(result!.latestBalance).toBeNull()
  })

  it('returns undefined when loan belongs to another user', async () => {
    mocks.mockLoanJoinLimit.mockResolvedValue([])
    const result = await findInstallmentLoanDetail('other-user', LOAN_ID)
    expect(result).toBeUndefined()
  })
})

// ── updateInstallmentLoanById ─────────────────────────────────────────────────

describe('updateInstallmentLoanById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockUpdateReturning.mockResolvedValue([{ ...loanRow, lender: 'ANZ' }])
  })

  it('updates and returns the loan when userId matches', async () => {
    const result = await updateInstallmentLoanById('user-123', LOAN_ID, { lender: 'ANZ' })
    expect(result).toBeDefined()
    expect(result!.lender).toBe('ANZ')
  })

  it('returns undefined when loan belongs to another user (no row updated)', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([])
    const result = await updateInstallmentLoanById('user-123', LOAN_ID, { lender: 'ANZ' })
    expect(result).toBeUndefined()
  })

  it('updates loanType correctly', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([{ ...loanRow, loanType: 'interest_only' }])
    const result = await updateInstallmentLoanById('user-123', LOAN_ID, { loanType: 'interest_only' })
    expect(result!.loanType).toBe('interest_only')
  })

  it('updates ioEndDate correctly', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([{ ...loanRow, ioEndDate: '2028-06-30' }])
    const result = await updateInstallmentLoanById('user-123', LOAN_ID, { ioEndDate: '2028-06-30' })
    expect(result!.ioEndDate).toBe('2028-06-30')
  })

  it('updates interestRate correctly', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([{ ...loanRow, interestRate: '6.25' }])
    const result = await updateInstallmentLoanById('user-123', LOAN_ID, { interestRate: '6.25' })
    expect(result!.interestRate).toBe('6.25')
  })
})
