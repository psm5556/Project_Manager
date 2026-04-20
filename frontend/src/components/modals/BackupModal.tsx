import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Archive, RotateCcw, Trash2, Plus } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { getBackups, createBackup, restoreBackup, deleteBackup } from '../../api'
import type { Project } from '../../types'

interface Props {
  project: Project
  onClose: () => void
}

export function BackupModal({ project, onClose }: Props) {
  const qc = useQueryClient()
  const isMaster = project.user_role === 'master'
  const [creating, setCreating] = useState(false)
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['backups', project.id],
    queryFn: () => getBackups(project.id),
  })

  const handleCreate = async () => {
    setCreating(true)
    try {
      await createBackup(project.id)
      qc.invalidateQueries({ queryKey: ['backups', project.id] })
      toast.success('백업 생성됨')
    } catch {
      toast.error('백업 실패')
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async (backupId: number, backupName: string) => {
    if (!confirm(`"${backupName}" 백업으로 복원하시겠습니까?\n현재 프로젝트 데이터가 해당 시점으로 교체됩니다.`)) return
    setRestoringId(backupId)
    try {
      await restoreBackup(project.id, backupId)
      // Invalidate all related queries
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['tech_items', project.id] })
      qc.invalidateQueries({ queryKey: ['activities', 'project', project.id] })
      toast.success('복원 완료')
      onClose()
    } catch {
      toast.error('복원 실패')
    } finally {
      setRestoringId(null)
    }
  }

  const handleDelete = async (backupId: number, backupName: string) => {
    if (!confirm(`"${backupName}" 백업을 삭제하시겠습니까?`)) return
    try {
      await deleteBackup(project.id, backupId)
      qc.invalidateQueries({ queryKey: ['backups', project.id] })
      toast.success('백업 삭제됨')
    } catch {
      toast.error('삭제 실패')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md
        border border-slate-200 dark:border-slate-700 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">백업 / 복구</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[280px]">{project.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg
            text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Create backup */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">현재 상태 백업</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">프로젝트명_날짜_시간으로 저장됩니다</p>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-brand-600 hover:bg-brand-700
                disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              {creating ? '저장 중...' : '백업하기'}
            </button>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* Backup list */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              백업 이력 ({backups.length})
            </p>

            {isLoading ? (
              <p className="text-sm text-slate-400 text-center py-4">로딩 중...</p>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-slate-400 dark:text-slate-500">
                <Archive size={32} className="opacity-30" />
                <p className="text-sm">백업 이력이 없습니다</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {backups.map(b => {
                  const isRestoring = restoringId === b.id
                  return (
                    <div key={b.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl
                        border border-slate-200 dark:border-slate-700
                        bg-slate-50 dark:bg-slate-800/50">
                      <Archive size={16} className="text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{b.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                          {format(new Date(b.created_at), 'yyyy-MM-dd HH:mm')}
                          {b.created_by_name && ` · ${b.created_by_name}`}
                        </p>
                      </div>
                      {isMaster && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleRestore(b.id, b.name)}
                            disabled={isRestoring}
                            title="이 백업으로 복원"
                            className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[12px] font-medium
                              bg-emerald-50 hover:bg-emerald-100 text-emerald-700
                              dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 dark:text-emerald-400
                              disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw size={11} />
                            {isRestoring ? '복원 중' : '복구'}
                          </button>
                          <button
                            onClick={() => handleDelete(b.id, b.name)}
                            title="백업 삭제"
                            className="w-7 h-7 flex items-center justify-center rounded-lg
                              text-slate-400 hover:text-red-500 hover:bg-red-50
                              dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={13} />
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
