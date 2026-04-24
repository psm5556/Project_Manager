import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Shield, ShieldOff, Trash2, KeyRound, Pencil, Check, Crown, LayoutDashboard, Users } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { adminListUsers, adminUpdateUser, adminResetPin, adminDeleteUser } from '../api'
import { useAuth } from '../contexts/AuthContext'
import type { User } from '../types'
import { AdminDashboard } from './AdminDashboard'

type Tab = 'dashboard' | 'users'

interface Props {
  onClose: () => void
}

export function AdminPage({ onClose }: Props) {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [resetPinId, setResetPinId] = useState<number | null>(null)
  const [newPin, setNewPin] = useState('')
  const [filter, setFilter] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminListUsers,
  })

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(filter.toLowerCase()) ||
    u.knox_id.toLowerCase().includes(filter.toLowerCase())
  )

  const startEdit = (u: User) => {
    setEditingId(u.id)
    setEditName(u.name)
  }

  const commitEdit = async (u: User) => {
    if (!editName.trim()) return
    try {
      await adminUpdateUser(u.id, { name: editName.trim() })
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('이름 수정됨')
    } catch {
      toast.error('수정 실패')
    } finally {
      setEditingId(null)
    }
  }

  const toggleAdmin = async (u: User) => {
    const action = u.is_admin ? '관리자 권한을 제거' : '관리자 권한을 부여'
    if (!confirm(`"${u.name}"에게 ${action}하시겠습니까?`)) return
    try {
      await adminUpdateUser(u.id, { is_admin: !u.is_admin })
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success(`${action}했습니다`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || '변경 실패')
    }
  }

  const handleResetPin = async (uid: number) => {
    if (newPin.length !== 6) { toast.error('PIN은 6자리여야 합니다'); return }
    try {
      await adminResetPin(uid, newPin)
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('PIN 초기화됨')
      setResetPinId(null)
      setNewPin('')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'PIN 초기화 실패')
    }
  }

  const handleDelete = async (u: User) => {
    if (!confirm(`"${u.name}" (${u.knox_id}) 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    try {
      await adminDeleteUser(u.id)
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('계정 삭제됨')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || '삭제 실패')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-3xl
        border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Crown size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">전체 관리자</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">시스템 관리</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg
            text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 pt-1">
          <TabBtn active={tab==='dashboard'} onClick={()=>setTab('dashboard')} icon={<LayoutDashboard size={13}/>}>대시보드</TabBtn>
          <TabBtn active={tab==='users'} onClick={()=>setTab('users')} icon={<Users size={13}/>}>사용자 관리</TabBtn>
        </div>

        {/* Dashboard tab */}
        {tab === 'dashboard' && <AdminDashboard/>}

        {/* Users tab */}
        {tab === 'users' && <>
        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="이름 또는 Knox ID 검색..."
            className="input-field"
          />
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 px-6 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            전체 <span className="font-semibold text-slate-700 dark:text-slate-300">{users.length}</span>명
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            관리자 <span className="font-semibold text-amber-600 dark:text-amber-400">{users.filter(u => u.is_admin).length}</span>명
          </span>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-slate-400 text-center py-8">로딩 중...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">사용자가 없습니다</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(u => {
                const isMe = u.id === me?.id
                const isEditing = editingId === u.id
                const isResetting = resetPinId === u.id
                return (
                  <div key={u.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      u.is_admin
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/30'
                    }`}>
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                        u.is_admin ? 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(u); if (e.key === 'Escape') setEditingId(null) }}
                                className="px-2 py-0.5 text-sm border border-brand-400 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                              />
                              <button onClick={() => commitEdit(u)} className="w-6 h-6 flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30">
                                <Check size={13} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{u.name}</span>
                          )}
                          {u.is_admin && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                              <Crown size={9} /> 관리자
                            </span>
                          )}
                          {isMe && <span className="text-[10px] text-brand-500 font-semibold">(나)</span>}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{u.knox_id}</p>
                        <p className="text-[11px] text-slate-300 dark:text-slate-600 mt-0.5">
                          가입: {format(new Date(u.created_at), 'yyyy-MM-dd')}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isEditing && (
                          <ActionBtn title="이름 수정" onClick={() => startEdit(u)}>
                            <Pencil size={13} />
                          </ActionBtn>
                        )}
                        <ActionBtn
                          title={u.is_admin ? '관리자 권한 제거' : '관리자 권한 부여'}
                          onClick={() => toggleAdmin(u)}
                          className={u.is_admin
                            ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}
                        >
                          {u.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}
                        </ActionBtn>
                        <ActionBtn
                          title="PIN 초기화"
                          onClick={() => { setResetPinId(isResetting ? null : u.id); setNewPin('') }}
                          className="text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        >
                          <KeyRound size={13} />
                        </ActionBtn>
                        {!isMe && (
                          <ActionBtn title="계정 삭제" onClick={() => handleDelete(u)}
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                            <Trash2 size={13} />
                          </ActionBtn>
                        )}
                      </div>
                    </div>

                    {/* PIN reset inline */}
                    {isResetting && (
                      <div className="mt-3 flex items-center gap-2 pl-12">
                        <input
                          type="password"
                          value={newPin}
                          onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="새 PIN 6자리"
                          maxLength={6}
                          inputMode="numeric"
                          autoFocus
                          className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600
                            bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
                            focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500
                            tracking-[0.3em] w-36"
                        />
                        <button
                          onClick={() => handleResetPin(u.id)}
                          disabled={newPin.length !== 6}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                            text-white text-xs font-medium transition-colors"
                        >
                          초기화
                        </button>
                        <button
                          onClick={() => { setResetPinId(null); setNewPin('') }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600
                            text-slate-500 dark:text-slate-400 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-brand-500 text-brand-600 dark:text-brand-400'
          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}>
      {icon}{children}
    </button>
  )
}

function ActionBtn({ children, onClick, title, className = 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700' }: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  className?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${className}`}
    >
      {children}
    </button>
  )
}
