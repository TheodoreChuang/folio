import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

export function Default() {
  return (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">Filter</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Filter by status</div>
          <div className="text-xs text-foreground-muted">Show only properties missing a statement</div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
