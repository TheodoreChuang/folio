import { LvrMeter } from '@/components/ui/lvr-meter'

export function Levels() {
  return (
    <div className="flex flex-col gap-6 p-6 w-[320px]">
      <div>
        <div className="text-xs text-foreground-muted mb-2">Low LVR — 45%</div>
        <LvrMeter value={0.45} />
      </div>
      <div>
        <div className="text-xs text-foreground-muted mb-2">Moderate LVR — 70%</div>
        <LvrMeter value={0.7} />
      </div>
      <div>
        <div className="text-xs text-foreground-muted mb-2">High LVR — 88%</div>
        <LvrMeter value={0.88} />
      </div>
    </div>
  )
}
