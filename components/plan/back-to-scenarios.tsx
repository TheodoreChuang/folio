import Link from 'next/link'

export function BackToScenarios() {
  return (
    <Link
      href="/plan"
      className="inline-flex items-center gap-2 h-8 px-3 pr-4 border border-border bg-surface rounded text-sm font-medium text-foreground-muted hover:bg-surface-sunken hover:text-foreground transition-colors mb-5"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M7 2.5 3.5 6 7 9.5" />
      </svg>
      All scenarios
    </Link>
  )
}
