---
title: Bulk PATCH Partial Failure Leaves Client State Diverged from Server
date: 2026-05-29
category: logic-errors
module: upload/ingestion
problem_type: logic_error
component: service_object
symptoms:
  - UI shows staging items as unmatched after a partial save failure
  - User sees stale session state that diverges silently from the DB
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [bulk-patch, partial-failure, client-state, ingestion, upload]
---

# Bulk PATCH Partial Failure Leaves Client State Diverged from Server

## Problem

When a bulk-PATCH handler uses `Promise.all` to save multiple items in parallel, it can partially succeed — some items saved, others not. If the error branch returns early without refreshing client state from the server, the UI shows a version of reality that no longer matches the DB.

## Symptoms

- After a partial failure, some sessions appear assigned in the UI but were never written to the DB
- Retrying the operation creates duplicate work or silently skips already-saved items
- The commit flow receives an inconsistent set of items: some approved, some still pending

## What Didn't Work

Relying on the optimistic local state update (setting `savingLoanSessions`, updating `sessionLoanMap`) without a server sync was the initial pattern. It works on the happy path but leaves state stale when the operation partially fails.

## Solution

In every error branch — both `Promise.allSettled` rejection paths and thrown exceptions — call the server-fetch function before returning:

```typescript
// Before: early return with stale state
const results = await Promise.allSettled(patchCalls)
if (results.some(r => r.status === 'rejected')) {
  toast.error('Some sessions could not be saved')
  return  // ❌ client state now diverges from DB
}

// After: always refresh on partial/full failure
const results = await Promise.allSettled(patchCalls)
if (results.some(r => r.status === 'rejected')) {
  toast.error('Some sessions could not be saved')
  await loadStagedItems()  // ✅ server is the source of truth
  return
}
```

The same pattern applies to caught exceptions:

```typescript
try {
  await Promise.all(patchCalls)
} catch {
  toast.error('Failed to save')
  await loadStagedItems()  // ✅ refresh before returning
  return
}
```

## Why This Works

`Promise.allSettled` lets all requests settle rather than aborting on the first rejection, so we can distinguish partial failures from total failures. After any failure, the server DB is the ground truth — re-fetching overwrites whatever optimistic local state was set, ensuring the UI accurately reflects what was actually saved.

## Prevention

- Any handler that fires multiple mutations in parallel must refresh server state in **all** non-happy-path branches, not just the fully-failed one
- Treat client state as a cache: it can lead, but on any error it must immediately sync back from the server
- Write a review checklist item: "does every error branch in this bulk operation call the server-fetch function before returning?"

## Related Issues

- Pattern applies to all three bulk-PATCH handlers in the upload page: `handleAssignProperty`, `handleAssignLoan`, and any future bulk commit handlers
