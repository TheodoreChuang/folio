import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

export function Default() {
  return (
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm">Net yield</Button>
        </TooltipTrigger>
        <TooltipContent>Net rental income divided by property value</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
