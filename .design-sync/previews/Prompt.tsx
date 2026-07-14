import { Prompt } from '@/components/ui/prompt'
import { Button } from '@/components/ui/button'

export function ActionRequired() {
  return (
    <div className="p-6 w-[560px]">
      <Prompt
        tone="action"
        severity="Action needed"
        message="3 properties are missing a PM statement for June"
        context={<span>Loan Ledger · Property Ledger</span>}
        actions={<Button size="sm">Review now</Button>}
      />
    </div>
  )
}

export function HeadsUp() {
  return (
    <div className="p-6 w-[560px]">
      <Prompt
        tone="heads-up"
        severity="Heads up"
        message="Expense ratio on 12 Marina Ave rose 6% this quarter"
      />
    </div>
  )
}

export function Complete() {
  return (
    <div className="p-6 w-[560px]">
      <Prompt tone="complete" severity="All clear" message="All statements reconciled for May" />
    </div>
  )
}
