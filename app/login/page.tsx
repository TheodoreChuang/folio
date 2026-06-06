'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [showExpiredBanner, setShowExpiredBanner] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [cooling, setCooling] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reason') === 'expired') {
      setShowExpiredBanner(true)
    }
  }, [])

  async function handleSend() {
    if (!email) return
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    setSent(true)
    toast.success('Magic link sent — check your inbox')
  }

  function startCooldown() {
    setCooling(true)
    setCooldown(30)
    const id = setInterval(() => {
      setCooldown(n => {
        if (n <= 1) {
          clearInterval(id)
          setCooling(false)
          return 0
        }
        return n - 1
      })
    }, 1000)
  }

  async function handleResend() {
    if (cooling) return
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      toast.error(error.message)
      return
    }
    startCooldown()
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex justify-between items-center px-10 py-8">
        <span className="font-display text-xl tracking-tight">
          Folio<em className="not-italic font-light text-foreground-muted text-[0.65em] ml-1">· beta</em>
        </span>
        <Link href="/" className="text-sm text-foreground-muted hover:text-foreground transition-colors">
          ← Back to home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">

          {showExpiredBanner && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-warn/40 bg-negative-soft px-4 py-3 text-sm text-[#7a3a1a]">
              <span className="flex-shrink-0">⚠️</span>
              <span className="flex-1">Your session expired — please sign in again.</span>
              <button
                onClick={() => setShowExpiredBanner(false)}
                className="flex-shrink-0 text-[#7a3a1a] hover:opacity-70"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}

          <Card>
            <CardContent className="pt-8 pb-8 px-8">
              {sent ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-accent-soft border border-accent/20 flex items-center justify-center text-accent mx-auto mb-6">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="18" height="13" rx="1.5" />
                      <path d="M3 7l9 7 9-7" />
                    </svg>
                  </div>

                  <h1 className="font-display font-normal text-2xl tracking-tight leading-tight text-center">
                    Check your inbox
                  </h1>

                  <div className="mt-5 text-center text-base leading-snug text-foreground-muted">
                    We sent a magic link to
                    <span className="block font-semibold text-foreground my-3 break-all">{email}</span>
                    <p className="font-display italic text-foreground mt-4">Click the link to log in.</p>
                  </div>

                  <div className="mt-7 pt-5 border-t border-rule text-center">
                    <span className="text-sm text-foreground-muted">Didn't get it?</span>
                    <button
                      className="ml-3 text-sm text-accent font-medium disabled:text-foreground-subtle disabled:pointer-events-none"
                      onClick={handleResend}
                      disabled={cooling}
                    >
                      {cooling ? `Resent · try again in ${cooldown}s` : 'Resend email'}
                    </button>
                  </div>

                  <div className="mt-6 text-center text-xs text-foreground-subtle leading-snug">
                    Link expires in 15 minutes. Check your spam folder, or{' '}
                    <button
                      className="text-foreground-muted underline underline-offset-2 hover:text-foreground"
                      onClick={() => setSent(false)}
                    >
                      use a different email →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-6">
                    <h1 className="font-display font-normal text-3xl tracking-tight leading-tight text-foreground">
                      Sign in
                    </h1>
                    <p className="font-display italic text-base text-foreground-muted mt-3 leading-snug">
                      Enter your email and we'll send you a sign-in link. No passwords to remember.
                    </p>
                  </div>

                  <div className="flex flex-col gap-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email address</Label>
                      <Input
                        id="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        className="h-11 text-base"
                      />
                    </div>
                    <Button className="w-full h-11 text-base" onClick={handleSend} disabled={!email || loading}>
                      {loading ? 'Sending…' : 'Send magic link →'}
                    </Button>
                  </div>

                  <div className="mt-5 flex items-start gap-3 text-xs text-foreground-muted leading-snug">
                    <span className="flex-shrink-0 mt-px text-accent">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="6" width="10" height="8" rx="1" />
                        <path d="M5 6V4a3 3 0 0 1 6 0v2" />
                      </svg>
                    </span>
                    <span>We don't use passwords. Each sign-in link is good for 15 minutes and works on one device.</span>
                  </div>

                  <div className="text-center mt-7 text-xs text-foreground-subtle">
                    New here?{' '}
                    <Link href="/" className="text-foreground-muted hover:text-foreground">
                      Read what Folio does first →
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
