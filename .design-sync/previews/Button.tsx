import { Button } from '@/components/ui/button'

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3 p-6">
      <Button variant="default">Save changes</Button>
      <Button variant="dark">Confirm</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="outline">Export</Button>
      <Button variant="ghost">Dismiss</Button>
      <Button variant="destructive">Delete property</Button>
      <Button variant="link">View details</Button>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3 p-6">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  )
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3 p-6">
      <Button disabled>Processing…</Button>
      <Button variant="outline" disabled>Unavailable</Button>
    </div>
  )
}
