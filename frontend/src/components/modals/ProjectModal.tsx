import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { createProject, updateProject } from '../../api'
import type { Project } from '../../types'

interface Props { project?: Project; onClose: () => void }

export function ProjectModal({ project, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState(project?.name ?? '')
  const [desc, setDesc] = useState(project?.description ?? '')

  const createMut = useMutation({
    mutationFn: () => createProject({ name, description: desc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('프로젝트 생성됨'); onClose() },
    onError: () => toast.error('생성 실패'),
  })
  const updateMut = useMutation({
    mutationFn: () => updateProject(project!.id, { name, description: desc, version: project!.version }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('저장됨'); onClose() },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? '저장 실패'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('프로젝트명을 입력하세요')
    project ? updateMut.mutate() : createMut.mutate()
  }
  const isPending = createMut.isPending || updateMut.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-md mx-4
        border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
              <FolderOpen size={16} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h2 className="font-semibold text-[14px] text-slate-900 dark:text-slate-100">
                {project ? '프로젝트 편집' : '프로젝트 생성'}
              </h2>
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg
              text-slate-400 hover:text-slate-600 hover:bg-slate-100
              dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              프로젝트명 <span className="text-red-500">*</span>
            </label>
            <input
              className={inputCls}
              value={name} onChange={e => setName(e.target.value)}
              placeholder="프로젝트명 입력" autoFocus
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">설명</label>
            <textarea
              className={`${inputCls} resize-none`} rows={3}
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="프로젝트 설명"
            />
          </div>
          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium
                border border-slate-200 dark:border-slate-600
                text-slate-600 dark:text-slate-300
                hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              취소
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold
                bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 transition-colors">
              {isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls = `
  w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5
  text-[13px] text-slate-900 dark:text-slate-100
  bg-white dark:bg-slate-700/50
  placeholder:text-slate-400 dark:placeholder:text-slate-500
  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
  transition-shadow
`
