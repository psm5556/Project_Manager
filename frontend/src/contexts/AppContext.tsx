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
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedTechItemId, setSelectedTechItemId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('gantt')
  const [darkMode, setDarkMode] = useState(false)

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
        toggleDarkMode: () => setDarkMode(p => !p),
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
