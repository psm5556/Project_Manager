import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

interface Props {
  onSwitch: () => void
}

export function RegisterPage({ onSwitch }: Props) {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [knoxId, setKnoxId] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const pinMismatch = pinConfirm.length === 6 && pin !== pinConfirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !knoxId.trim() || pin.length !== 6) return
    if (pin !== pinConfirm) {
      toast.error('PIN이 일치하지 않습니다')
      return
    }
    setLoading(true)
    try {
      await register(name.trim(), knoxId.trim(), pin)
      toast.success('계정이 생성되었습니다')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || '계정 등록 실패')
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">계정 등록</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">새 계정을 만드세요</p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-card-md p-8 flex flex-col gap-5
            border border-slate-200 dark:border-slate-800"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">이름</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              autoFocus
              className="input-field"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Knox ID</label>
            <input
              type="text"
              value={knoxId}
              onChange={e => setKnoxId(e.target.value)}
              placeholder="Knox ID를 입력하세요"
              className="input-field"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">PIN (6자리 숫자)</label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              inputMode="numeric"
              className="input-field tracking-[0.3em]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">PIN 확인</label>
            <input
              type="password"
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              inputMode="numeric"
              className={`input-field tracking-[0.3em] ${pinMismatch ? 'border-red-400 focus:ring-red-400/40 focus:border-red-400' : ''}`}
            />
            {pinMismatch && (
              <p className="text-xs text-red-500">PIN이 일치하지 않습니다</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim() || !knoxId.trim() || pin.length !== 6 || pin !== pinConfirm}
            className="mt-1 h-10 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50
              text-white text-sm font-semibold transition-colors"
          >
            {loading ? '등록 중...' : '계정 등록'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-5">
          이미 계정이 있으신가요?{' '}
          <button
            onClick={onSwitch}
            className="text-brand-600 dark:text-brand-400 font-semibold hover:underline"
          >
            로그인
          </button>
        </p>
      </div>
    </div>
  )
}
