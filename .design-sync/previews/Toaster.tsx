import * as React from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/toaster'

export function Default() {
  React.useEffect(() => {
    toast.success('Report generated', { description: 'June statement reconciled for 42 Wattle Street' })
  }, [])

  return (
    <div className="p-6 w-[360px] h-[140px] relative">
      <Toaster />
    </div>
  )
}
