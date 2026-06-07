'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useSidebar } from '@/components/sidebar-context'

function getInitials(email: string): string {
  const local = email.split('@')[0]
  const parts = local.split(/[._\-+]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

function NavItem({
  href,
  active,
  children,
  className,
}: {
  href: string
  active: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-[10px] h-[34px] px-3 rounded-[5px] text-[0.875rem] w-full transition-colors',
        active
          ? 'bg-accent-soft text-accent font-medium before:content-[""] before:absolute before:-left-1 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-sm before:bg-accent'
          : 'text-foreground-muted hover:bg-surface hover:text-foreground',
        className,
      )}
    >
      {children}
    </Link>
  )
}

// ── icons ──────────────────────────────────────────────────────────────────

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      {children}
    </svg>
  )
}

function DashboardIcon() {
  return <Icon><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></Icon>
}

function InsightsIcon() {
  return (
    <Icon>
      <rect x="2" y="10" width="3" height="4"/>
      <rect x="6.5" y="6" width="3" height="8"/>
      <rect x="11" y="3" width="3" height="11"/>
    </Icon>
  )
}

function UploadIcon() {
  return <Icon><path d="M3 11v2h10v-2" /><path d="M8 3v8M5 6l3-3 3 3" /></Icon>
}

function HouseholdIcon() {
  return <Icon><circle cx="8" cy="6" r="2.5" /><path d="M2.5 14a5.5 5.5 0 0 1 11 0" /></Icon>
}

function PropertiesIcon() {
  return <Icon><path d="M2 13V7l6-4 6 4v6" /><path d="M6 13V9h4v4" /></Icon>
}

function LoansIcon() {
  return <Icon><rect x="1" y="4" width="14" height="9" rx="1.5" /><path d="M1 8h14" /><circle cx="4.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" /></Icon>
}

function PlanIcon() {
  return <Icon><path d="M2 13l3-4 3 2 4-6 2 3" /></Icon>
}

function SettingsIcon() {
  return <Icon><circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" /></Icon>
}

// ── collapsible section ────────────────────────────────────────────────────

function NavSection({
  href,
  icon,
  label,
  open,
  onToggle,
  active,
  children,
}: {
  href: string
  icon: React.ReactNode
  label: string
  open: boolean
  onToggle: () => void
  active: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <div className="flex items-center gap-0.5">
        <Link
          href={href}
          className={cn(
            'relative flex flex-1 items-center gap-[10px] h-[34px] px-3 rounded-[5px] text-[0.875rem] min-w-0 transition-colors',
            active
              ? 'bg-accent-soft text-accent font-medium before:content-[""] before:absolute before:-left-1 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-sm before:bg-accent'
              : 'text-foreground-muted hover:bg-surface hover:text-foreground',
          )}
        >
          {icon}
          {label}
        </Link>
        <button
          onClick={onToggle}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
          className="flex-shrink-0 w-[26px] h-[26px] flex items-center justify-center rounded-[4px] text-foreground-muted hover:bg-surface hover:text-foreground transition-colors mr-1"
        >
          <span
            className="block w-[7px] h-[7px] border-r-[1.4px] border-b-[1.4px] border-current transition-transform duration-120"
            style={{ transform: open ? 'rotate(45deg)' : 'rotate(-45deg)', transformOrigin: '60% 60%' }}
          />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </>
  )
}

// ── sidebar ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { properties, loans } = useSidebar()
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(true)
  const [loansOpen, setLoansOpen] = useState(true)
  const menuRef = useRef<HTMLDivElement>(null)

  // Auto-expand section when navigating into it
  useEffect(() => {
    if (pathname.startsWith('/properties')) setPropertiesOpen(true)
  }, [pathname])
  useEffect(() => {
    if (pathname.startsWith('/loans')) setLoansOpen(true)
  }, [pathname])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = email ? getInitials(email) : '…'

  return (
    <aside className="bg-sidebar border-r border-border flex flex-col gap-0.5 px-4 py-7 sticky top-0 h-screen overflow-y-auto">
      {/* Brand */}
      <div className="font-display text-2xl tracking-tight leading-none px-3 pb-6">
        Folio
        <em className="not-italic font-light text-foreground-muted ml-1" style={{ fontSize: '0.7em' }}>
          · beta
        </em>
      </div>

      <NavItem href="/dashboard" active={pathname.startsWith('/dashboard')}>
        <DashboardIcon />
        Portfolio pulse
      </NavItem>

      <NavItem href="/insights" active={pathname.startsWith('/insights')}>
        <InsightsIcon />
        Insights
      </NavItem>

      <NavItem href="/upload" active={pathname.startsWith('/upload')}>
        <UploadIcon />
        Upload
      </NavItem>

      <NavItem href="/household" active={pathname.startsWith('/household')}>
        <HouseholdIcon />
        Household
      </NavItem>

      <NavSection
        href="/properties"
        icon={<PropertiesIcon />}
        label="Properties"
        open={propertiesOpen}
        onToggle={() => setPropertiesOpen(v => !v)}
        active={pathname === '/properties'}
      >
        {properties.map(p => (
          <NavItem
            key={p.id}
            href={`/properties/${p.id}`}
            active={pathname === `/properties/${p.id}`}
            className="pl-8 text-[0.8125rem]"
          >
            {p.nickname ?? p.address}
          </NavItem>
        ))}
        <NavItem
          href="/properties/new"
          active={pathname === '/properties/new'}
          className="pl-8 text-[0.8125rem]"
        >
          + Add property
        </NavItem>
      </NavSection>

      <NavSection
        href="/loans"
        icon={<LoansIcon />}
        label="Loans"
        open={loansOpen}
        onToggle={() => setLoansOpen(v => !v)}
        active={pathname === '/loans'}
      >
        {loans.map(l => (
          <NavItem
            key={l.id}
            href={`/loans/${l.id}`}
            active={pathname === `/loans/${l.id}`}
            className="pl-8 text-[0.8125rem]"
          >
            {l.lender}{l.nickname ? ` · ${l.nickname}` : ''}
          </NavItem>
        ))}
        <NavItem
          href="/loans/new"
          active={pathname === '/loans/new'}
          className="pl-8 text-[0.8125rem]"
        >
          + Add loan
        </NavItem>
      </NavSection>

      <div className="mt-3 flex flex-col gap-0.5">
        <NavItem href="/plan" active={pathname.startsWith('/plan')}>
          <PlanIcon />
          Plan
        </NavItem>
        <NavItem href="/settings" active={pathname.startsWith('/settings')}>
          <SettingsIcon />
          Settings
        </NavItem>
      </div>

      {/* Footer — avatar + sign out */}
      <div className="mt-auto pt-5 border-t border-rule flex items-center gap-3 px-3 relative" ref={menuRef}>
        <button
          data-testid="user-avatar"
          onClick={() => setMenuOpen(v => !v)}
          className="w-[26px] h-[26px] rounded-full bg-accent flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 hover:opacity-80 transition-opacity"
          aria-label="User menu"
          aria-expanded={menuOpen}
        >
          {initials}
        </button>
        <div className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
          {email ?? '…'}
        </div>

        {menuOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-lg border border-border bg-white shadow-md py-1">
            {email && (
              <div className="px-3 py-2 text-xs text-foreground-muted truncate border-b border-border mb-1">
                {email}
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-background transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
