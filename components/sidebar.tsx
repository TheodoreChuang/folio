'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

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
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-[10px] h-[34px] px-3 rounded-[5px] text-[0.875rem] w-full transition-colors',
        active
          ? 'bg-accent-light text-accent font-medium before:content-[""] before:absolute before:-left-1 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-sm before:bg-accent'
          : 'text-muted hover:bg-surface hover:text-ink',
      )}
    >
      {children}
    </Link>
  )
}

function DashboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  )
}

function PropertiesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <path d="M2 13V7l6-4 6 4v6" />
      <path d="M6 13V9h4v4" />
    </svg>
  )
}

function LoansIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <rect x="1" y="4" width="14" height="9" rx="1.5" />
      <path d="M1 8h14" />
      <circle cx="4.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <path d="M3 11v2h10v-2" />
      <path d="M8 3v8M5 6l3-3 3 3" />
    </svg>
  )
}

function EntitiesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-foreground-subtle" aria-hidden>
      <circle cx="8" cy="6" r="2.5" />
      <path d="M2.5 14a5.5 5.5 0 0 1 11 0" />
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
    <aside className="bg-sidebar border-r border-border flex flex-col gap-0.5 px-4 py-7 sticky top-0 h-screen overflow-y-auto">
      {/* Brand */}
      <div className="font-serif text-2xl tracking-tight leading-none px-3 pb-6">
        Folio
        <em className="not-italic font-light text-muted ml-1" style={{ fontSize: '0.7em' }}>
          · beta
        </em>
      </div>

      <NavItem href="/dashboard" active={pathname.startsWith('/dashboard')}>
        <DashboardIcon />
        Portfolio pulse
      </NavItem>

      <NavItem href="/upload" active={pathname.startsWith('/upload')}>
        <UploadIcon />
        Upload
      </NavItem>

      <NavItem href="/properties" active={pathname.startsWith('/properties')}>
        <PropertiesIcon />
        All properties
      </NavItem>

      <NavItem href="/loans" active={pathname.startsWith('/loans')}>
        <LoansIcon />
        All loans
      </NavItem>

      <NavItem href="/entities" active={pathname.startsWith('/entities')}>
        <EntitiesIcon />
        Entities
      </NavItem>

      {/* Footer — avatar + sign out */}
      <div className="mt-auto pt-5 border-t border-ruled flex items-center gap-3 px-3 relative" ref={menuRef}>
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
