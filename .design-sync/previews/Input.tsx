import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Default() {
  return (
    <div className="flex flex-col gap-4 p-6 w-[280px]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ds-address">Property address</Label>
        <Input id="ds-address" placeholder="42 Wattle Street" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ds-rent">Weekly rent</Label>
        <Input id="ds-rent" defaultValue="612" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ds-disabled">Locked field</Label>
        <Input id="ds-disabled" defaultValue="Read only" disabled />
      </div>
    </div>
  )
}
