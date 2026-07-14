import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

export function Default() {
  return (
    <Select defaultOpen defaultValue="brisbane">
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select entity" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="brisbane">42 Wattle Street</SelectItem>
        <SelectItem value="marina">12 Marina Ave</SelectItem>
        <SelectItem value="trust">Smith Family Trust</SelectItem>
      </SelectContent>
    </Select>
  )
}
