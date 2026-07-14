import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

export function Default() {
  return (
    <div className="flex flex-col gap-1.5 p-6 w-[240px]">
      <Label htmlFor="ds-label-name">Entity name</Label>
      <Input id="ds-label-name" placeholder="Smith Family Trust" />
    </div>
  )
}
