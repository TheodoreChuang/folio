import Link from 'next/link'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
      {children}
    </div>
  )
}

function SettingsCard({
  icon,
  title,
  description,
  href,
  disabled,
  soon,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href?: string
  disabled?: boolean
  soon?: boolean
}) {
  const inner = (
    <div className="flex items-start gap-4 p-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-foreground-muted">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground flex items-center gap-2">
          {title}
          {soon && (
            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-muted bg-surface px-1.5 py-0.5 rounded">
              Soon
            </span>
          )}
        </div>
        <div className="text-xs text-foreground-muted mt-0.5 leading-relaxed">{description}</div>
      </div>
      <span className="text-foreground-muted text-lg leading-none flex-shrink-0 mt-0.5" aria-hidden>›</span>
    </div>
  )

  if (disabled) {
    return (
      <div className="rounded-lg border border-border bg-white opacity-50 cursor-not-allowed">
        {inner}
      </div>
    )
  }

  return (
    <Link
      href={href ?? '#'}
      className="rounded-lg border border-border bg-white hover:bg-surface transition-colors block"
    >
      {inner}
    </Link>
  )
}

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl text-foreground">Settings</h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Admin areas that don&apos;t change often. Most live here so they stay out of your way.
        </p>
      </div>

      <div className="space-y-8">
        <div>
          <SectionLabel>Profile</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <SettingsCard
              href="/settings/profile"
              title="Investor profile"
              description="Your investment goals and strategy notes. Used to personalise AI responses and keep your intent on record."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <circle cx="9" cy="6.5" r="2.5" />
                  <path d="M3.5 15a5.5 5.5 0 0 1 11 0" />
                </svg>
              }
            />
          </div>
        </div>

        <div>
          <SectionLabel>Portfolio configuration</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <SettingsCard
              href="/entities"
              title="Entities"
              description="Trusts, companies, and individuals that own property in Folio. Rarely changed — typically when a structure changes."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <rect x="2.5" y="3" width="6" height="6" rx="0.6" />
                  <rect x="9.5" y="3" width="6" height="6" rx="0.6" />
                  <rect x="6" y="10" width="6" height="6" rx="0.6" />
                </svg>
              }
            />
            <SettingsCard
              disabled
              soon
              title="Members & access"
              description="Invite an accountant, broker, or partner to view your portfolio. Permissions are read-only by default."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <circle cx="6.5" cy="6.5" r="2.5" />
                  <path d="M2 14.5a4.5 4.5 0 0 1 9 0" />
                  <circle cx="13" cy="6.5" r="2" />
                  <path d="M11.5 14.5a4 4 0 0 1 4.5-3.4" />
                </svg>
              }
            />
            <SettingsCard
              disabled
              soon
              title="Imports & integrations"
              description="Direct feeds from banks & managing agents so you don't have to upload PDFs."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <path d="M9 2v9M6 8l3 3 3-3" />
                  <rect x="3" y="13" width="12" height="3" rx="0.6" />
                </svg>
              }
            />
            <SettingsCard
              disabled
              soon
              title="Tax & financial year"
              description="Set your financial year (Jul–Jun by default), depreciation method, and how Folio rounds."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <path d="M3 5h12M3 9h12M3 13h8" />
                  <path d="M14 11l2 2-2 2" />
                </svg>
              }
            />
          </div>
        </div>

        <div>
          <SectionLabel>Developer</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <SettingsCard
              href="/settings/api-keys"
              title="API keys"
              description="Create bearer-token keys for programmatic access and AI tools. Keys carry your full permissions — manage them here."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <circle cx="7" cy="10" r="3.5" />
                  <path d="M10.2 7.8L16 2M14 4l1.5 1.5" strokeLinecap="round" />
                </svg>
              }
            />
          </div>
        </div>

        <div>
          <SectionLabel>Workspace</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <SettingsCard
              disabled
              soon
              title="Notifications"
              description="When Folio emails you. Prompts, missing statements, IO rollover warnings, monthly digests."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <path d="M3 4h12v8H3z" />
                  <path d="M3 6l6 4 6-4" />
                </svg>
              }
            />
            <SettingsCard
              disabled
              soon
              title="Plan & billing"
              description="You're on the Beta plan while Folio is in early access. Free until June 2026."
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <rect x="2" y="6" width="14" height="9" rx="1" />
                  <path d="M2 9h14" />
                  <path d="M6 12h2" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
