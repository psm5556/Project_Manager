import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, User, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateProfile, resetOwnPin } from '../../api'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  onClose: () => void
}

export function ProfileModal({ onClose }: Props) {
  const { user, updateUser } = useAuth()

  const [name,       setName]       = useState(user?.name ?? '')
  const [knoxId,     setKnoxId]     = useState(user?.knox_id ?? '')
  const [curPin,     setCurPin]     = useState('')
  const [newPin,     setNewPin]     = useState('')
  const [confirmPin, setConfirmPin] = useState('')

  const profileMut = useMutation({
    mutationFn: () => updateProfile({ name: name.trim(), knox_id: knoxId.trim() }),
    onSuccess: u => { updateUser(u); toast.success('프로필이 업데이트되었습니다') },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? '업데이트 실패'),
  })

  const pinMut = useMutation({
    mutationFn: () => resetOwnPin({ current_pin: curPin, new_pin: newPin }),
    onSuccess: () => { toast.success('PIN이 변경되었습니다'); setCurPin(''); setNewPin(''); setConfirmPin('') },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? 'PIN 변경 실패'),
  })

  const handleProfile = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('이름을 입력하세요')
    if (!knoxId.trim()) return toast.error('Knox ID를 입력하세요')
    profileMut.mutate()
  }

  const handlePin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!curPin) return toast.error('현재 PIN을 입력하세요')
    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) return toast.error('새 PIN은 6자리 숫자여야 합니다')
    if (newPin !== confirmPin) return toast.error('새 PIN이 일치하지 않습니다')
    pinMut.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-md mx-4
        border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100">프로필 설정</h2>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg
              text-slate-400 hover:text-slate-600 hover:bg-slate-100
              dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-6">

          {/* ── Profile section ─────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <User size={14} className="text-brand-500" />
              <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                프로필 정보
              </span>
            </div>
            <form onSubmit={handleProfile} className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input className={iCls} value={name} onChange={e => setName(e.target.value)}
                  placeholder="이름 입력" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Knox ID <span className="text-red-500">*</span>
                </label>
                <input className={iCls} value={knoxId} onChange={e => setKnoxId(e.target.value)}
                  placeholder="knox_id 입력" />
              </div>
              <button type="submit" disabled={profileMut.isPending}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold
                  bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 transition-colors">
                {profileMut.isPending ? '업데이트 중...' : '프로필 업데이트'}
              </button>
            </form>
          </section>

          <div className="border-t border-slate-100 dark:border-slate-700" />

          {/* ── PIN section ─────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <KeyRound size={14} className="text-amber-500" />
              <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                PIN 재설정
              </span>
            </div>
            <form onSubmit={handlePin} className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  현재 PIN
                </label>
                <input type="password" inputMode="numeric" maxLength={6}
                  className={iCls} value={curPin} onChange={e => setCurPin(e.target.value)}
                  placeholder="현재 6자리 PIN" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  새 PIN
                </label>
                <input type="password" inputMode="numeric" maxLength={6}
                  className={iCls} value={newPin} onChange={e => setNewPin(e.target.value)}
                  placeholder="새 6자리 PIN" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  새 PIN 확인
                </label>
                <input type="password" inputMode="numeric" maxLength={6}
                  className={iCls} value={confirmPin} onChange={e => setConfirmPin(e.target.value)}
                  placeholder="새 PIN 재입력" />
              </div>
              <button type="submit" disabled={pinMut.isPending}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold
                  bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors">
                {pinMut.isPending ? '변경 중...' : 'PIN 재설정'}
              </button>
            </form>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-[13px] font-medium
              border border-slate-200 dark:border-slate-600
              text-slate-600 dark:text-slate-300
              hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

const iCls = `
  w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5
  text-[13px] text-slate-900 dark:text-slate-100
  bg-white dark:bg-slate-700/50
  placeholder:text-slate-400 dark:placeholder:text-slate-500
  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
  transition-shadow
`
