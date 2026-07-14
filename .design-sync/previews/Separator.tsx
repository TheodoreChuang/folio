import { Separator } from '@/components/ui/separator'

export function Horizontal() {
  return (
    <div className="p-6 w-[280px]">
      <div className="text-sm">Cashflow summary</div>
      <Separator className="my-3" />
      <div className="text-sm text-foreground-muted">Expense breakdown</div>
    </div>
  )
}

export function Vertical() {
  return (
    <div className="flex items-center gap-4 p-6 h-[80px]">
      <span className="text-sm">Rent</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Expenses</span>
    </div>
  )
}
