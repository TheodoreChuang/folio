import { Badge } from '@/components/ui/badge'

export function Default() {
  return (
    <div className="flex flex-wrap gap-2 p-6">
      <Badge variant="complete">Complete</Badge>
      <Badge variant="partial">Partial</Badge>
      <Badge variant="missing">Missing</Badge>
      <Badge variant="estimated">Estimated</Badge>
      <Badge variant="neutral">Neutral</Badge>
    </div>
  )
}

export function WithDot() {
  return (
    <div className="flex flex-wrap gap-2 p-6">
      <Badge variant="complete" dot>Statement received</Badge>
      <Badge variant="missing" dot>Awaiting statement</Badge>
    </div>
  )
}
