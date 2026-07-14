import { Card, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function Default() {
  return (
    <Card className="w-[320px]">
      <CardFooter>
        <Button variant="outline" size="sm">View property</Button>
      </CardFooter>
    </Card>
  )
}
