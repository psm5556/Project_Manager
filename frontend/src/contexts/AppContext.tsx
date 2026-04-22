import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ViewMode } from '../types'

interface AppContextType {
  selectedProjectId: number | null
  setSelectedProjectId: (id: number | null) => void
  selectedTechItemId: number | null
  setSelectedTechItemId: (id: number | null) => void
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  darkMode: boolean
  toggleDarkMode: () => void
  sidebarOpen: boolean
  toggleSidebar: () => void
}

const AppContext = createContext<AppContextType | null>(null)

function readDarkMode(): boolean {
  try { return localStorage.getItem('pm_darkMode') === 'true' } catch { return false }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedTechItemId, setSelectedTechItemId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('gantt')
  const [darkMode, setDarkMode] = useState(readDarkMode)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleDarkMode = () => setDarkMode(p => {
    const next = !p
    try { localStorage.setItem('pm_darkMode', String(next)) } catch {}
    return next
  })

  return (
    <AppContext.Provider
      value={{
        selectedProjectId,
        setSelectedProjectId,
        selectedTechItemId,
        setSelectedTechItemId,
        viewMode,
        setViewMode,
        darkMode,
        toggleDarkMode,
        sidebarOpen,
        toggleSidebar: () => setSidebarOpen(p => !p),
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
