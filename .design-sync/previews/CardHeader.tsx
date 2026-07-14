import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function Default() {
  return (
    <Card className="w-[320px]">
      <CardHeader>
        <div>
          <CardTitle>42 Wattle Street</CardTitle>
          <CardDescription>Brisbane, QLD</CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}
