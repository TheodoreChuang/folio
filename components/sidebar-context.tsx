'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type SidebarProperty = { id: string; address: string; nickname: string | null }
type SidebarLoan = { id: string; lender: string; nickname: string | null }
type SidebarEntity = { id: string; name: string }

type SidebarContextValue = {
  properties: SidebarProperty[]
  loans: SidebarLoan[]
  entities: SidebarEntity[]
  loaded: boolean
  refresh: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [properties, setProperties] = useState<SidebarProperty[]>([])
  const [loans, setLoans] = useState<SidebarLoan[]>([])
  const [entities, setEntities] = useState<SidebarEntity[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchOnce = useCallback(async () => {
    let allSucceeded = true
    try {
      const [propsRes, loansRes, entitiesRes] = await Promise.all([
        fetch('/api/v1/properties'),
        fetch('/api/v1/loans'),
        fetch('/api/v1/entities'),
      ])
      if (propsRes.ok) {
        const data = await propsRes.json() as { properties?: SidebarProperty[] }
        setProperties(data.properties ?? [])
      } else {
        allSucceeded = false
      }
      if (loansRes.ok) {
        const data = await loansRes.json() as { loans?: SidebarLoan[] }
        setLoans(data.loans ?? [])
      } else {
        allSucceeded = false
      }
      if (entitiesRes.ok) {
        const data = await entitiesRes.json() as { entities?: SidebarEntity[] }
        setEntities(data.entities ?? [])
      } else {
        allSucceeded = false
      }
    } catch {
      // Network failure — sidebar lists stay at current state
      allSucceeded = false
    }
    return allSucceeded
  }, [])

  const fetchData = useCallback(async () => {
    // Only flip `loaded` to true on a fully successful read. assistant-dock.tsx's first-run
    // trigger gates on `loaded && properties.length === 0 && loans.length === 0` — if we marked
    // `loaded` true on a failed/partial fetch, a transient network error on page load would be
    // indistinguishable from a genuinely empty portfolio and could auto-open the dock with an
    // unsolicited "finish setting up" message for an established user. One retry after a short
    // delay absorbs a transient blip (e.g. a cold serverless function) without retrying forever;
    // a subsequent successful `refresh()` call still flips it once real data arrives.
    if (await fetchOnce()) {
      setLoaded(true)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (await fetchOnce()) setLoaded(true)
  }, [fetchOnce])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <SidebarContext.Provider value={{ properties, loans, entities, loaded, refresh: fetchData }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}
