import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function Default() {
  return (
    <Card className="w-[360px]">
      <CardHeader>
        <div>
          <CardTitle>42 Wattle Street</CardTitle>
          <CardDescription>Brisbane, QLD</CardDescription>
        </div>
        <Badge variant="complete">Complete</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="text-2xl font-semibold tabular-nums">$612/wk</div>
        <div className="text-xs text-foreground-muted">Net yield 4.2%</div>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">View property</Button>
      </CardFooter>
    </Card>
  )
}
