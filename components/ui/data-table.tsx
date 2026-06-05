import * as React from 'react'
import { cn } from '@/lib/utils'

function DataTable({ className, children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full rounded-[7px] border border-border overflow-hidden bg-surface">
      <table className={cn('w-full border-collapse text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

function DataTableHead({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-surface-sunken', className)} {...props}>
      {children}
    </thead>
  )
}

function DataTableHeadCell({ className, numeric, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        'px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-subtle border-b border-border select-none',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  )
}

function DataTableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />
}

function DataTableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-rule last:border-0 hover:bg-surface-sunken/60 cursor-pointer transition-colors', className)}
      {...props}
    />
  )
}

function DataTableCell({ className, numeric, muted, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; muted?: boolean }) {
  return (
    <td
      className={cn(
        'px-5 h-[34px] text-foreground align-middle',
        numeric && 'text-right tabular-nums',
        muted && 'text-foreground-muted',
        className,
      )}
      {...props}
    />
  )
}

export { DataTable, DataTableHead, DataTableHeadCell, DataTableBody, DataTableRow, DataTableCell }
