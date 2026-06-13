'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  createdAt: string
}

// ── Utilities ──────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Create key dialog ──────────────────────────────────────────────────────

function CreateKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (key: ApiKeyRow) => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && !createdKey) {
      setName('')
      setSaving(false)
      setCreatedKey(null)
      setCopied(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, createdKey])

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? 'Failed to create API key')
        return
      }
      const { apiKey } = await res.json()
      setCreatedKey(apiKey.key)
      onCreated({ id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix, lastUsedAt: null, createdAt: apiKey.createdAt })
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDone() {
    setCreatedKey(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={open ? handleDone : undefined}>
      <DialogContent className="max-w-md">
        {!createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="key-name">
                  Key name
                </label>
                <Input
                  id="key-name"
                  ref={inputRef}
                  placeholder="e.g. Claude integration"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                  maxLength={100}
                />
                <p className="text-xs text-foreground-muted">Give it a name that identifies where you&apos;ll use it.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || saving}>
                {saving ? 'Creating…' : 'Create key'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Save your API key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                This key will only be shown once. Copy it now and store it somewhere safe.
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Your new API key</label>
                <div className="flex gap-2">
                  <code className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm font-mono break-all select-all">
                    {createdKey}
                  </code>
                  <Button variant="outline" className="flex-shrink-0" onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleDone}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Revoke confirm dialog ──────────────────────────────────────────────────

function RevokeDialog({
  keyName,
  onConfirm,
  onCancel,
  revoking,
}: {
  keyName: string
  onConfirm: () => void
  onCancel: () => void
  revoking: boolean
}) {
  return (
    <Dialog open onOpenChange={revoking ? undefined : onCancel}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Revoke API key?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-foreground-muted py-2">
          <strong className="text-foreground">{keyName}</strong> will stop working immediately. This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={revoking}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={revoking}>
            {revoking ? 'Revoking…' : 'Revoke key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Key row ────────────────────────────────────────────────────────────────

function KeyRow({ row, onRevoke }: { row: ApiKeyRow; onRevoke: (id: string, name: string) => void }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{row.name}</div>
        <div className="flex items-center gap-3 mt-0.5">
          <code className="text-xs text-foreground-muted font-mono">{row.keyPrefix}…</code>
          <span className="text-xs text-foreground-muted">Created {formatDate(row.createdAt)}</span>
          <span className="text-xs text-foreground-muted">Last used {formatDate(row.lastUsedAt)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
        onClick={() => onRevoke(row.id, row.name)}
      >
        Revoke
      </Button>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    fetch('/api/v1/api-keys')
      .then(r => r.json())
      .then(({ apiKeys }) => setKeys(apiKeys ?? []))
      .catch(() => toast.error('Failed to load API keys'))
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(key: ApiKeyRow) {
    setKeys(prev => [key, ...prev])
  }

  async function handleRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const res = await fetch(`/api/v1/api-keys/${revokeTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? 'Failed to revoke key')
        return
      }
      setKeys(prev => prev.filter(k => k.id !== revokeTarget.id))
      toast.success(`"${revokeTarget.name}" revoked`)
      setRevokeTarget(null)
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">API keys</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Keys authenticate external access to the Folio API. Each key carries your full permissions — treat them like passwords.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="flex-shrink-0 ml-6">
          Create key
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-foreground-muted py-8 text-center">Loading…</div>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-border bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">No API keys yet</p>
          <p className="text-xs text-foreground-muted mt-1">Create a key to access Folio programmatically or via AI tools.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            Create your first key
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white px-4">
          {keys.map(key => (
            <KeyRow key={key.id} row={key} onRevoke={(id, name) => setRevokeTarget({ id, name })} />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-lg bg-surface border border-border px-4 py-3">
        <p className="text-xs text-foreground-muted leading-relaxed">
          <strong className="text-foreground">Using your key:</strong> Pass it as a Bearer token — <code className="font-mono bg-white border border-border rounded px-1">Authorization: Bearer sk_live_...</code>. The API reference is available at{' '}
          <code className="font-mono bg-white border border-border rounded px-1">/api/v1/openapi.json</code>.
        </p>
      </div>

      <CreateKeyDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />

      {revokeTarget && (
        <RevokeDialog
          keyName={revokeTarget.name}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
          revoking={revoking}
        />
      )}
    </div>
  )
}
