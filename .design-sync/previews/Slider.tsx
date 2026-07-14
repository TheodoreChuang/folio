import { Slider } from '@/components/ui/slider'

export function Default() {
  return (
    <div className="p-6 w-[280px]">
      <Slider defaultValue={[65]} max={100} step={1} />
    </div>
  )
}

export function Range() {
  return (
    <div className="p-6 w-[280px]">
      <Slider defaultValue={[20, 80]} max={100} step={1} />
    </div>
  )
}
