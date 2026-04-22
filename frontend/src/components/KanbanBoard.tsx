import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Calendar, User, AlertCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { format, parseISO, isPast } from 'date-fns'
import toast from 'react-hot-toast'
import { useApp } from '../contexts/AppContext'
import {
  getProjectActivities, getTechItemActivities, getTechItems,
  deleteActivity, updateActivity,
} from '../api'
import { ActivityModal } from './modals/ActivityModal'
import type { Activity, TechItem } from '../types'

interface Column {
  status: string
  label: string
  accent: string
  dot: string
  cardRing: string
}

const COLUMNS: Column[] = [
  {
    status:   'review',
    label:    '검토',
    accent:   'bg-amber-50 dark:bg-amber-950/40 border-b-2 border-amber-300 dark:border-amber-700',
    dot:      'bg-amber-400',
    cardRing: 'hover:ring-amber-200 dark:hover:ring-amber-800',
  },
  {
    status:   'in_progress',
    label:    '진행',
    accent:   'bg-blue-50 dark:bg-blue-950/40 border-b-2 border-blue-400 dark:border-blue-700',
    dot:      'bg-blue-400',
    cardRing: 'hover:ring-blue-200 dark:hover:ring-blue-800',
  },
  {
    status:   'complete',
    label:    '완료',
    accent:   'bg-emerald-50 dark:bg-emerald-950/40 border-b-2 border-emerald-400 dark:border-emerald-700',
    dot:      'bg-emerald-400',
    cardRing: 'hover:ring-emerald-200 dark:hover:ring-emerald-800',
  },
]

export function KanbanBoard() {
  const { selectedProjectId, selectedTechItemId, sidebarOpen, toggleSidebar } = useApp()
  const qc = useQueryClient()
  const [actModal, setActModal] = useState<{ open: boolean; activity?: Activity }>({ open: false })
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const { data: activities = [], isLoading } = useQuery({
    queryKey: selectedTechItemId
      ? ['activities', 'ti', selectedTechItemId]
      : ['activities', 'project', selectedProjectId],
    queryFn: () =>
      selectedTechItemId
        ? getTechItemActivities(selectedTechItemId)
        : getProjectActivities(selectedProjectId!),
    enabled: !!(selectedProjectId || selectedTechItemId),
  })

  const { data: techItems = [] } = useQuery({
    queryKey: ['tech_items', selectedProjectId],
    queryFn: () => getTechItems(selectedProjectId!),
    enabled: !!selectedProjectId,
  })

  const tiMap = Object.fromEntries((techItems as TechItem[]).map(t => [t.id, t.name]))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activities', 'project', selectedProjectId] })
    if (selectedTechItemId) qc.invalidateQueries({ queryKey: ['activities', 'ti', selectedTechItemId] })
  }

  const moveMut = useMutation({
    mutationFn: ({ a, status }: { a: Activity; status: string }) =>
      updateActivity(a.id, {
        tech_item_id: a.tech_item_id, name: a.name,
        start_date: a.start_date, end_date: a.end_date,
        completion_date: status === 'complete' ? a.completion_date : null, assignee: a.assignee,
        status: status as any, notes: a.notes, order: a.order,
        version: a.version,
      }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.response?.data?.detail ?? '업데이트 실패'),
  })

  const delMut = useMutation({
    mutationFn: (id: number) => deleteActivity(id),
    onSuccess: () => { invalidate(); toast.success('삭제됨') },
    onError: () => toast.error('삭제 실패'),
  })

  if (!selectedProjectId && !selectedTechItemId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl">
            📂
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            사이드바에서 프로젝트 또는 Tech Item을 선택하세요.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><div className="text-slate-400 text-sm">로딩 중...</div></div>
  }

  const grouped = COLUMNS.reduce<Record<string, Activity[]>>((acc, col) => {
    acc[col.status] = activities.filter(a => a.status === col.status)
    return acc
  }, {})

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900
        border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <button onClick={toggleSidebar} title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
          className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0
            text-slate-400 hover:text-slate-600 hover:bg-slate-100
            dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors">
          {sidebarOpen ? <PanelLeftClose size={15}/> : <PanelLeftOpen size={15}/>}
        </button>
        <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
          {activities.length}개 Activity
        </span>
        <button
          onClick={() => setActModal({ open: true })}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium
            bg-brand-600 hover:bg-brand-700 text-white transition-colors"
        >
          <Plus size={13} /> Activity 추가
        </button>
      </div>

      {/* Kanban columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto overflow-y-hidden">
        {COLUMNS.map(col => {
          const cards = grouped[col.status] ?? []
          const isOver = dragOver === col.status

          return (
            <div
              key={col.status}
              className={`flex-1 min-w-[300px] max-w-[420px] flex flex-col rounded-xl
                border border-slate-200 dark:border-slate-700
                bg-white dark:bg-slate-900
                shadow-card transition-all duration-150
                ${isOver ? 'ring-2 ring-brand-400 dark:ring-brand-600 scale-[1.01]' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(col.status) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(null)
                if (dragging == null) return
                const a = activities.find(x => x.id === dragging)
                if (a && a.status !== col.status) moveMut.mutate({ a, status: col.status })
                setDragging(null)
              }}
            >
              {/* Column header */}
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-t-xl ${col.accent}`}>
                <div className={`w-2 h-2 rounded-full ${col.dot} shadow-sm`} />
                <span className="font-semibold text-[13px] text-slate-800 dark:text-slate-100">
                  {col.label}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="min-w-[22px] text-center text-[11px] font-bold
                    bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300
                    px-1.5 py-0.5 rounded-full">
                    {cards.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {cards.map(a => (
                  <KanbanCard
                    key={a.id}
                    activity={a}
                    techItemName={tiMap[a.tech_item_id] ?? '?'}
                    cardRing={col.cardRing}
                    onEdit={() => setActModal({ open: true, activity: a })}
                    onDelete={() => {
                      if (confirm(`"${a.name}"을 삭제하시겠습니까?`)) delMut.mutate(a.id)
                    }}
                    onDragStart={() => setDragging(a.id)}
                    onDragEnd={() => setDragging(null)}
                  />
                ))}
                {cards.length === 0 && (
                  <div className={`flex flex-col items-center justify-center py-10 rounded-lg
                    border-2 border-dashed border-slate-200 dark:border-slate-700
                    text-slate-300 dark:text-slate-600 text-[12px] gap-1
                    ${isOver ? 'border-brand-300 dark:border-brand-700 bg-brand-50/30 dark:bg-brand-900/10' : ''}`}>
                    <span className="text-2xl">✦</span>
                    <span>항목 없음</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {actModal.open && selectedProjectId && (
        <ActivityModal
          projectId={selectedProjectId}
          defaultTechItemId={selectedTechItemId ?? undefined}
          activity={actModal.activity}
          onClose={() => setActModal({ open: false })}
        />
      )}
    </div>
  )
}

// ── KanbanCard ────────────────────────────────────────────────────────────────
function KanbanCard({
  activity, techItemName, cardRing, onEdit, onDelete, onDragStart, onDragEnd,
}: {
  activity: Activity
  techItemName: string
  cardRing: string
  onEdit: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const fmt = (d: string | null) => d ? format(parseISO(d), 'MM/dd') : null

  const isOverdue = !activity.completion_date
    && activity.end_date
    && isPast(parseISO(activity.end_date))
    && activity.status !== 'complete'

  const completionMissing = activity.status === 'complete' && !activity.completion_date

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      className={`
        bg-white dark:bg-slate-800
        rounded-xl border border-slate-200 dark:border-slate-700
        p-3.5 shadow-card
        hover:shadow-card-md hover:ring-1 ${cardRing}
        cursor-pointer active:cursor-grabbing
        transition-all duration-150 group
        ${isOverdue ? 'border-l-2 border-l-red-400' : ''}
        ${completionMissing ? 'border-l-2 border-l-red-400' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 flex-1">
          {activity.name}
        </p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}
            className="w-6 h-6 flex items-center justify-center rounded-md
              text-slate-400 hover:text-slate-600 hover:bg-slate-100
              dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Pencil size={11} />
          </button>
          <button onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded-md
              text-slate-400 hover:text-red-500 hover:bg-red-50
              dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Tech Item badge */}
      <div className="mb-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium
          bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
          {techItemName}
        </span>
      </div>

      {/* Meta */}
      <div className="space-y-1">
        {(activity.start_date || activity.end_date) && (
          <div className={`flex items-center gap-1.5 text-[11px] ${
            isOverdue ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
          }`}>
            <Calendar size={10} className="flex-shrink-0" />
            <span>{fmt(activity.start_date) ?? '?'} ~ {fmt(activity.end_date) ?? '?'}</span>
            {isOverdue && (
              <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400 font-semibold ml-0.5">
                <AlertCircle size={9} /> 지연
              </span>
            )}
          </div>
        )}

        {activity.completion_date && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <span className="font-bold">✓</span>
            <span>완료: {fmt(activity.completion_date)}</span>
          </div>
        )}

        {completionMissing && (
          <div className="flex items-center gap-1.5 text-[11px] text-red-500 dark:text-red-400">
            <AlertCircle size={10} />
            <span className="font-medium">완료일 미입력</span>
          </div>
        )}

        {activity.assignee && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <User size={10} className="flex-shrink-0" />
            <span>{activity.assignee}</span>
          </div>
        )}
      </div>

      {activity.notes && (
        <p className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700
          text-[11px] text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
          {activity.notes}
        </p>
      )}
    </div>
  )
}
