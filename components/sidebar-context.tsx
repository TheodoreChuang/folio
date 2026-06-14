'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type SidebarProperty = { id: string; address: string; nickname: string | null }
type SidebarLoan = { id: string; lender: string; nickname: string | null }

type SidebarContextValue = {
  properties: SidebarProperty[]
  loans: SidebarLoan[]
  refresh: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [properties, setProperties] = useState<SidebarProperty[]>([])
  const [loans, setLoans] = useState<SidebarLoan[]>([])

  const fetchData = useCallback(async () => {
    try {
      const [propsRes, loansRes] = await Promise.all([
        fetch('/api/v1/properties'),
        fetch('/api/v1/loans'),
      ])
      if (propsRes.ok) {
        const data = await propsRes.json() as { properties?: SidebarProperty[] }
        setProperties(data.properties ?? [])
      }
      if (loansRes.ok) {
        const data = await loansRes.json() as { loans?: SidebarLoan[] }
        setLoans(data.loans ?? [])
      }
    } catch {
      // Network failure — sidebar lists stay at current state
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <SidebarContext.Provider value={{ properties, loans, refresh: fetchData }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}
