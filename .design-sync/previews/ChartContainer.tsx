import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'

const data = [
  { month: 'Jan', cashflow: 820 },
  { month: 'Feb', cashflow: 940 },
  { month: 'Mar', cashflow: 880 },
  { month: 'Apr', cashflow: 1020 },
  { month: 'May', cashflow: 1150 },
  { month: 'Jun', cashflow: 1240 },
]

const config = {
  cashflow: { label: 'Net cashflow', color: 'hsl(188 32% 32%)' },
} satisfies ChartConfig

export function Default() {
  return (
    <div className="p-6 w-[420px] h-[260px]">
      <ChartContainer config={config}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            dataKey="cashflow"
            type="monotone"
            stroke="var(--color-cashflow)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
