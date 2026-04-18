import { Toaster } from 'react-hot-toast'
import { AppProvider, useApp } from './contexts/AppContext'
import { useWebSocket } from './hooks/useWebSocket'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import { GanttChart } from './components/GanttChart'
import { KanbanBoard } from './components/KanbanBoard'

function Layout() {
  const { darkMode, viewMode } = useApp()
  useWebSocket()

  return (
    <div className={darkMode ? 'dark' : ''} style={{ height: '100%' }}>
      <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <Navbar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden">
            {viewMode === 'gantt' ? <GanttChart /> : <KanbanBoard />}
          </main>
        </div>
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3500,
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            borderRadius: '10px',
            padding: '10px 14px',
            boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}
