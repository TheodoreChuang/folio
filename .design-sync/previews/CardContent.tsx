import { Card, CardContent } from '@/components/ui/card'

export function Default() {
  return (
    <Card className="w-[320px]">
      <CardContent className="flex flex-col gap-1">
        <div className="text-2xl font-semibold tabular-nums">$612/wk</div>
        <div className="text-xs text-foreground-muted">Net yield 4.2%</div>
      </CardContent>
    </Card>
  )
}
