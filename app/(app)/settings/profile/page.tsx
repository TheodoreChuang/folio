'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

type ProfileData = {
  investmentGoal: string
  strategyNotes: string
}

const GOAL_MAX = 200
const STRATEGY_MAX = 500

export default function InvestorProfilePage() {
  const [goal, setGoal] = useState('')
  const [strategy, setStrategy] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/profile')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(({ profile }: { profile: ProfileData | null }) => {
        if (profile) {
          setGoal(profile.investmentGoal ?? '')
          setStrategy(profile.strategyNotes ?? '')
        }
      })
      .catch(() => setSaveStatus('error'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investmentGoal: goal, strategyNotes: strategy }),
      })
      if (!res.ok) {
        setSaveStatus('error')
        return
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl text-foreground">Investor profile</h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Your investment goals and strategy, in one place.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-foreground-muted py-8 text-center">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-[560px]">
          <div className="rounded-lg border border-border bg-white p-6 flex flex-col gap-6">

            <div className="flex flex-col gap-2">
              <label htmlFor="profile-goal" className="text-sm font-medium text-foreground">
                Investment goal
              </label>
              <p className="text-xs text-foreground-muted -mt-1">
                e.g. $2,000/month passive income in 15 years
              </p>
              <textarea
                id="profile-goal"
                rows={3}
                maxLength={GOAL_MAX}
                placeholder="What are you working toward?"
                value={goal}
                onChange={e => {
                  setGoal(e.target.value)
                  setSaveStatus('idle')
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              />
              <div className={`text-xs text-right tabular-nums ${goal.length >= GOAL_MAX - 20 ? 'text-amber-600' : 'text-foreground-muted'}`}>
                {goal.length}/{GOAL_MAX}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="profile-strategy" className="text-sm font-medium text-foreground">
                Strategy notes
              </label>
              <p className="text-xs text-foreground-muted -mt-1">
                e.g. detached houses only, no units
              </p>
              <textarea
                id="profile-strategy"
                rows={4}
                maxLength={STRATEGY_MAX}
                placeholder="Rules of thumb you invest by"
                value={strategy}
                onChange={e => {
                  setStrategy(e.target.value)
                  setSaveStatus('idle')
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
              />
              <div className={`text-xs text-right tabular-nums ${strategy.length >= STRATEGY_MAX - 50 ? 'text-amber-600' : 'text-foreground-muted'}`}>
                {strategy.length}/{STRATEGY_MAX}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
              {saveStatus === 'saved' && (
                <span className="text-sm text-green-700">Saved</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-sm text-red-600">Something went wrong — try again</span>
              )}
            </div>

            <p className="text-xs text-foreground-muted -mt-2">
              Your profile is visible only to you.
            </p>
          </div>
        </form>
      )}
    </div>
  )
}
