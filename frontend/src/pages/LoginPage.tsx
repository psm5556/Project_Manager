import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

interface Props {
  onSwitch: () => void
}

export function LoginPage({ onSwitch }: Props) {
  const { login } = useAuth()
  const [knoxId, setKnoxId] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!knoxId.trim() || !pin.trim()) return
    setLoading(true)
    try {
      await login(knoxId.trim(), pin)
      toast.success('로그인 성공')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || '로그인 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
            <span className="text-white text-xl font-bold">PM</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Project Manager</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">로그인하여 계속하세요</p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-card-md p-8 flex flex-col gap-5
            border border-slate-200 dark:border-slate-800"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Knox ID</label>
            <input
              type="text"
              value={knoxId}
              onChange={e => setKnoxId(e.target.value)}
              placeholder="Knox ID를 입력하세요"
              autoFocus
              className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                placeholder-slate-400 dark:placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500
                text-sm transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">PIN (6자리)</label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              inputMode="numeric"
              className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                placeholder-slate-400 dark:placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500
                text-sm tracking-[0.3em] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !knoxId.trim() || pin.length !== 6}
            className="mt-1 h-10 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50
              text-white text-sm font-semibold transition-colors"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-5">
          계정이 없으신가요?{' '}
          <button
            onClick={onSwitch}
            className="text-brand-600 dark:text-brand-400 font-semibold hover:underline"
          >
            계정 등록
          </button>
        </p>
      </div>
    </div>
  )
}
