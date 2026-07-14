'use client'
import { Toaster as Sonner } from 'sonner'

/*
  Sonner is the toast library recommended by shadcn.
  Styled to match Folio tokens.
  Add <Toaster /> to app/layout.tsx.
  Use: import { toast } from 'sonner'
       toast.success('Report generated')
       toast.error('Extraction failed')
*/
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'bg-white border border-border rounded-lg shadow-lg font-sans text-sm text-foreground',
          title: 'font-semibold',
          description: 'text-foreground-muted text-xs',
          success: 'border-l-4 border-l-accent',
          error:   'border-l-4 border-l-warning',
          warning: 'border-l-4 border-l-warning',
        },
      }}
    />
  )
}
