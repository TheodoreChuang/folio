'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const d = new Date()
d.setMonth(d.getMonth() - 1)
const lastMonth = d.toISOString().slice(0, 7)

function getInitials(email: string): string {
  const local = email.split('@')[0]
  const parts = local.split(/[._\-+]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

function NavItem({
  href,
  active,
  indented,
  dim,
  children,
}: {
  href: string
  active: boolean
  indented?: boolean
  dim?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-2 h-[34px] px-2 rounded-[5px] text-[0.875rem] w-full transition-colors',
        indented && 'pl-5 text-[0.8125rem]',
        dim && 'text-foreground-subtle hover:text-muted',
        !dim && active && 'bg-accent-light text-accent font-medium',
        !dim && !active && 'text-muted hover:bg-surface hover:text-ink',
        active && 'before:content-[""] before:absolute before:-left-1 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-sm before:bg-accent',
      )}
    >
      {children}
    </Link>
  )
}

function CollapsibleSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center gap-1.5 px-2 pt-4 pb-1 text-[0.6875rem] uppercase tracking-[0.1em] text-foreground-subtle font-medium w-full select-none"
      >
        {label}
        <span
          className={cn(
            'ml-auto w-2 h-2 border-r border-b border-current inline-block transition-transform duration-100',
            collapsed ? '-rotate-135' : 'rotate-45',
          )}
          style={{ transformOrigin: '60% 60%' }}
        />
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </>
  )
}

// Lucide-style icons (14×14)
function DashboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <path d="M8 11V3M5 6l3-3 3 3" />
      <path d="M2 13h12" />
    </svg>
  )
}

function ReportsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M5 8h6M5 11h4M5 5h6" />
    </svg>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
    <aside className="bg-sidebar border-r border-border flex flex-col gap-0.5 px-3 py-7 sticky top-0 h-screen overflow-y-auto">
      {/* Brand */}
      <div className="font-serif text-2xl tracking-tight leading-none px-2 pb-6">
        Folio
        <em className="not-italic font-light text-muted ml-1" style={{ fontSize: '0.7em' }}>
          · beta
        </em>
      </div>

      {/* Main nav items */}
      <NavItem href="/dashboard" active={pathname.startsWith('/dashboard')}>
        <DashboardIcon />
        Portfolio pulse
      </NavItem>

      <NavItem href="/upload" active={pathname.startsWith('/upload')}>
        <UploadIcon />
        Upload
      </NavItem>

      <NavItem href={`/reports/${lastMonth}`} active={pathname.startsWith('/reports')}>
        <ReportsIcon />
        Reports
      </NavItem>

      {/* Properties section */}
      <CollapsibleSection label="Properties">
        <NavItem href="/properties" active={pathname.startsWith('/properties')} indented>
          All properties
        </NavItem>
        <NavItem href="/properties" active={false} indented dim>
          + Add property
        </NavItem>
      </CollapsibleSection>

      {/* Entities */}
      <CollapsibleSection label="Other">
        <NavItem href="/entities" active={pathname.startsWith('/entities')} indented>
          Entities
        </NavItem>
      </CollapsibleSection>

      {/* Footer — avatar + sign out */}
      <div className="mt-auto pt-5 border-t border-ruled flex items-center gap-2 px-2 relative" ref={menuRef}>
        <button
          data-testid="user-avatar"
          onClick={() => setMenuOpen(v => !v)}
          className="w-[26px] h-[26px] rounded-full bg-accent flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 hover:opacity-80 transition-opacity"
          aria-label="User menu"
          aria-expanded={menuOpen}
        >
          {initials}
        </button>
        <div className="text-sm font-medium text-ink truncate flex-1 min-w-0">
          {email ?? '…'}
        </div>

        {menuOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-lg border border-border bg-white shadow-md py-1">
            {email && (
              <div className="px-3 py-2 text-xs text-muted truncate border-b border-border mb-1">
                {email}
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-screen-bg transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
