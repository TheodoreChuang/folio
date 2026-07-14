import { MetricTile } from '@/components/ui/metric-tile'

export function Default() {
  return (
    <div className="grid grid-cols-2 gap-4 p-6 w-[440px]">
      <MetricTile label="Net cashflow" value="$1,240" foot={<span>per month</span>} />
      <MetricTile
        label="Gross yield"
        value="4.8%"
        secondary
        foot={<span>vs 4.2% last quarter</span>}
      />
    </div>
  )
}
