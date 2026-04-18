import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { format, addWeeks } from 'date-fns'
import toast from 'react-hot-toast'
import { createActivity, updateActivity, getTechItems } from '../../api'
import type { Activity } from '../../types'

interface Props {
  projectId: number
  defaultTechItemId?: number
  activity?: Activity
  onClose: () => void
}

const STATUS_OPTIONS = [
  { value: 'review',     label: '검토' },
  { value: 'in_progress',label: '진행' },
  { value: 'complete',   label: '완료' },
]

export function ActivityModal({ projectId, defaultTechItemId, activity, onClose }: Props) {
  const qc = useQueryClient()

  const [techItemId,      setTechItemId]      = useState<number>(activity?.tech_item_id ?? defaultTechItemId ?? 0)
  const [name,            setName]            = useState(activity?.name ?? '')
  const [startDate,       setStartDate]       = useState(activity?.start_date ?? format(new Date(), 'yyyy-MM-dd'))
  const [endDate,         setEndDate]         = useState(activity?.end_date ?? format(addWeeks(new Date(), 1), 'yyyy-MM-dd'))
  const [completionDate,  setCompletionDate]  = useState(activity?.completion_date ?? '')
  const [assignee,        setAssignee]        = useState(activity?.assignee ?? '')
  const [status,          setStatus]          = useState<string>(activity?.status ?? 'review')
  const [notes,           setNotes]           = useState(activity?.notes ?? '')

  // Auto-complete when completionDate is set
  useEffect(() => {
    if (completionDate) setStatus('complete')
  }, [completionDate])

  const { data: techItems = [] } = useQuery({
    queryKey: ['tech_items', projectId],
    queryFn: () => getTechItems(projectId),
  })

  const invalidate = (ti: number) => {
    qc.invalidateQueries({ queryKey: ['activities', 'project', projectId] })
    qc.invalidateQueries({ queryKey: ['activities', 'ti', ti] })
  }

  const createMut = useMutation({
    mutationFn: () => createActivity({
      tech_item_id: techItemId, name,
      start_date: startDate || null, end_date: endDate || null,
      completion_date: completionDate || null, assignee,
      status: status as any, notes, order: 0,
    }),
    onSuccess: d => { invalidate(d.tech_item_id); toast.success('Activity 생성됨'); onClose() },
    onError: () => toast.error('생성 실패'),
  })

  const updateMut = useMutation({
    mutationFn: () => updateActivity(activity!.id, {
      tech_item_id: techItemId, name,
      start_date: startDate || null, end_date: endDate || null,
      completion_date: completionDate || null, assignee,
      status: status as any, notes, order: activity!.order,
      version: activity!.version,
    }),
    onSuccess: d => { invalidate(d.tech_item_id); toast.success('저장됨'); onClose() },
    onError: (e: any) => toast.error(e.response?.data?.detail ?? '저장 실패'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Activity명을 입력하세요')
    if (!techItemId)  return toast.error('Tech Item을 선택하세요')
    activity ? updateMut.mutate() : createMut.mutate()
  }

  const isPending = createMut.isPending || updateMut.isPending

  const completionMissing = status === 'complete' && !completionDate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-lg mx-4
        max-h-[92vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4
          border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-[15px] text-slate-900 dark:text-slate-100">
              {activity ? 'Activity 편집' : 'Activity 생성'}
            </h2>
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5">
              {activity ? '항목을 수정합니다.' : '새 Activity를 추가합니다.'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg
              text-slate-400 hover:text-slate-600 hover:bg-slate-100
              dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Tech Item */}
          <Field label="Tech Item" required>
            <select className={selectCls} value={techItemId}
              onChange={e => setTechItemId(Number(e.target.value))}>
              <option value={0}>선택하세요</option>
              {techItems.map(ti => <option key={ti.id} value={ti.id}>{ti.name}</option>)}
            </select>
          </Field>

          {/* Activity name */}
          <Field label="Activity명" required>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)}
              placeholder="Activity 이름" autoFocus />
          </Field>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="시작일">
              <input type="date" className={inputCls} value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </Field>
            <Field label="종료일">
              <input type="date" className={inputCls} value={endDate}
                onChange={e => setEndDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="완료일" warn={completionMissing} warnMsg="완료 상태이나 완료일 없음">
              <input type="date"
                className={`${inputCls} ${completionMissing ? 'ring-2 ring-red-400 border-red-300' : ''}`}
                value={completionDate}
                onChange={e => setCompletionDate(e.target.value)} />
            </Field>
            <Field label="담당자">
              <input className={inputCls} value={assignee} onChange={e => setAssignee(e.target.value)}
                placeholder="담당자" />
            </Field>
          </div>

          {/* Status */}
          <Field label="상태">
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStatus(o.value)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-all ${
                    status === o.value
                      ? o.value === 'review'      ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300'
                        : o.value === 'in_progress' ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-600 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Notes */}
          <Field label="메모">
            <textarea className={`${inputCls} resize-none`} rows={3} value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="메모 입력" />
          </Field>
        </form>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-medium
              border border-slate-200 dark:border-slate-600
              text-slate-600 dark:text-slate-300
              hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            취소
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold
              bg-brand-600 hover:bg-brand-700 text-white
              disabled:opacity-50 transition-colors">
            {isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────
function Field({ label, required, warn, warnMsg, children }: {
  label: string; required?: boolean; warn?: boolean; warnMsg?: string; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {warn && warnMsg && (
          <span className="text-[11px] text-red-500 dark:text-red-400">{warnMsg}</span>
        )}
      </div>
      {children}
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

const selectCls = `
  w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5
  text-[13px] text-slate-900 dark:text-slate-100
  bg-white dark:bg-slate-700/50
  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
  transition-shadow cursor-pointer
`
