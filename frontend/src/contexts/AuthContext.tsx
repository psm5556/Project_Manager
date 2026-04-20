import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { User } from '../types'
import { loginUser, registerUser, getMe } from '../api'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (knox_id: string, pin: string) => Promise<void>
  register: (name: string, knox_id: string, pin: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('pm_token')
    if (!savedToken) {
      setIsLoading(false)
      return
    }
    setToken(savedToken)
    getMe()
      .then(u => setUser(u))
      .catch(() => {
        localStorage.removeItem('pm_token')
        setToken(null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (knox_id: string, pin: string) => {
    const { token: t, user: u } = await loginUser({ knox_id, pin })
    localStorage.setItem('pm_token', t)
    setToken(t)
    setUser(u)
  }

  const register = async (name: string, knox_id: string, pin: string) => {
    const { token: t, user: u } = await registerUser({ name, knox_id, pin })
    localStorage.setItem('pm_token', t)
    setToken(t)
    setUser(u)
  }

  const logout = () => {
    localStorage.removeItem('pm_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
