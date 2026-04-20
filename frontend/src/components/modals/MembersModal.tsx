import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Search, UserPlus, Crown, UserMinus, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMembers, addMember, removeMember, updateMemberRole, searchUsers } from '../../api'
import { useAuth } from '../../contexts/AuthContext'
import type { Project, User } from '../../types'

interface Props {
  project: Project
  onClose: () => void
}

export function MembersModal({ project, onClose }: Props) {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const isMaster = project.user_role === 'master'

  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members', project.id],
    queryFn: () => getMembers(project.id),
  })

  const handleSearch = async () => {
    if (!searchQ.trim()) return
    setSearching(true)
    try {
      const results = await searchUsers(searchQ.trim())
      // Filter out already-members
      const memberIds = new Set(members.map(m => m.user_id))
      setSearchResults(results.filter(u => !memberIds.has(u.id)))
    } catch {
      toast.error('검색 실패')
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (user: User, role: 'master' | 'member' = 'member') => {
    try {
      await addMember(project.id, { knox_id: user.knox_id, role })
      qc.invalidateQueries({ queryKey: ['members', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      setSearchResults(prev => prev.filter(u => u.id !== user.id))
      toast.success(`${user.name} 추가됨`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || '추가 실패')
    }
  }

  const handleRemove = async (userId: number, userName: string) => {
    if (!confirm(`"${userName}"을 프로젝트에서 제거하시겠습니까?`)) return
    try {
      await removeMember(project.id, userId)
      qc.invalidateQueries({ queryKey: ['members', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success('멤버 제거됨')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || '제거 실패')
    }
  }

  const handleToggleRole = async (userId: number, currentRole: string) => {
    const newRole = currentRole === 'master' ? 'member' : 'master'
    try {
      await updateMemberRole(project.id, userId, newRole)
      qc.invalidateQueries({ queryKey: ['members', project.id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(`권한 변경: ${newRole === 'master' ? '마스터' : '멤버'}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || '변경 실패')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md
        border border-slate-200 dark:border-slate-700 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">프로젝트 멤버</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[280px]">{project.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg
            text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Search section (master only) */}
          {isMaster && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">멤버 추가</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="이름 또는 Knox ID 검색"
                  className="input-field flex-1"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQ.trim()}
                  className="px-3 h-10 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50
                    text-white text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  <Search size={14} />
                  {searching ? '검색 중' : '검색'}
                </button>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                  {searchResults.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-2.5
                      border-b border-slate-100 dark:border-slate-800 last:border-0
                      hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{u.knox_id}</p>
                      </div>
                      <button
                        onClick={() => handleAdd(u, 'member')}
                        className="w-7 h-7 flex items-center justify-center rounded-lg
                          bg-brand-50 hover:bg-brand-100 text-brand-600
                          dark:bg-brand-900/20 dark:hover:bg-brand-900/40 dark:text-brand-400
                          transition-colors"
                        title="멤버로 추가"
                      >
                        <UserPlus size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {searchResults.length === 0 && searchQ && !searching && (
                <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">검색 결과 없음</p>
              )}
            </div>
          )}

          {/* Member list */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              현재 멤버 ({members.length})
            </p>
            {isLoading ? (
              <p className="text-sm text-slate-400 text-center py-4">로딩 중...</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">멤버가 없습니다</p>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {members.map(m => {
                  const isMe = m.user_id === me?.id
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5
                      border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</p>
                          {isMe && <span className="text-[10px] text-brand-500 font-semibold">(나)</span>}
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{m.knox_id}</p>
                      </div>

                      {/* Role badge */}
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        m.role === 'master'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {m.role === 'master' ? <Crown size={10} /> : <Shield size={10} />}
                        {m.role === 'master' ? '마스터' : '멤버'}
                      </div>

                      {/* Actions (master only, not on self) */}
                      {isMaster && !isMe && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleRole(m.user_id, m.role)}
                            title={m.role === 'master' ? '멤버로 변경' : '마스터로 변경'}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-400
                              hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                          >
                            <Crown size={12} />
                          </button>
                          <button
                            onClick={() => handleRemove(m.user_id, m.name)}
                            title="제거"
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-400
                              hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <UserMinus size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
