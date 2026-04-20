import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AppProvider, useApp } from './contexts/AppContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useWebSocket } from './hooks/useWebSocket'
import { Navbar } from './components/Navbar'
import { Sidebar } from './components/Sidebar'
import { GanttChart } from './components/GanttChart'
import { KanbanBoard } from './components/KanbanBoard'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { AdminPage } from './pages/AdminPage'

function Layout() {
  const { darkMode, viewMode } = useApp()
  const [showAdmin, setShowAdmin] = useState(false)
  useWebSocket()

  return (
    <div className={darkMode ? 'dark' : ''} style={{ height: '100%' }}>
      <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <Navbar onOpenAdmin={() => setShowAdmin(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden">
            {viewMode === 'gantt' ? <GanttChart /> : <KanbanBoard />}
          </main>
        </div>
      </div>
      {showAdmin && <AdminPage onClose={() => setShowAdmin(false)} />}
    </div>
  )
}

type AuthScreen = 'login' | 'register'

function AuthGate() {
  const { user, isLoading } = useAuth()
  const [screen, setScreen] = useState<AuthScreen>('login')

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <span className="text-white text-sm font-bold">PM</span>
          </div>
          <p className="text-sm text-slate-400">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return screen === 'login'
      ? <LoginPage onSwitch={() => setScreen('register')} />
      : <RegisterPage onSwitch={() => setScreen('login')} />
  }

  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}

const toastStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSize: '13px',
  borderRadius: '10px',
  padding: '10px 14px',
  boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3500,
          style: toastStyle,
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </AuthProvider>
  )
}
