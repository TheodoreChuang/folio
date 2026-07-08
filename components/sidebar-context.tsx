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

  const fetchData = useCallback(async () => {
    try {
      const [propsRes, loansRes, entitiesRes] = await Promise.all([
        fetch('/api/v1/properties'),
        fetch('/api/v1/loans'),
        fetch('/api/v1/entities'),
      ])
      if (propsRes.ok) {
        const data = await propsRes.json() as { properties?: SidebarProperty[] }
        setProperties(data.properties ?? [])
      }
      if (loansRes.ok) {
        const data = await loansRes.json() as { loans?: SidebarLoan[] }
        setLoans(data.loans ?? [])
      }
      if (entitiesRes.ok) {
        const data = await entitiesRes.json() as { entities?: SidebarEntity[] }
        setEntities(data.entities ?? [])
      }
    } catch {
      // Network failure — sidebar lists stay at current state
    } finally {
      // Set even on failure — the empty-portfolio check gates on `loaded`, not on success,
      // since arrays start [] before the fetch resolves and would otherwise misfire forever.
      setLoaded(true)
    }
  }, [])

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
