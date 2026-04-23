import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2,
  FolderOpen, Folder, Layers, Users, Archive, GripVertical,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../contexts/AppContext'
import { getProjects, getTechItems, deleteProject, deleteTechItem, reorderTechItems } from '../api'
import { ProjectModal } from './modals/ProjectModal'
import { TechItemModal } from './modals/TechItemModal'
import { MembersModal } from './modals/MembersModal'
import { BackupModal } from './modals/BackupModal'
import type { Project, TechItem } from '../types'

const MIN_W = 160
const MAX_W = 900

function readSidebarWidth(): number {
  try { return Math.min(MAX_W, Math.max(MIN_W, parseInt(localStorage.getItem('pm_sidebarWidth') || '440'))) }
  catch { return 440 }
}

export function Sidebar() {
  const { selectedProjectId, setSelectedProjectId, selectedTechItemId, setSelectedTechItemId, sidebarOpen } = useApp()
  const qc = useQueryClient()
  const [width, setWidth]             = useState(readSidebarWidth)
  const [resizing, setResizing]       = useState(false)
  const dragRef                       = useRef({ startX: 0, startW: 0 })
  const [expanded, setExpanded]       = useState<Set<number>>(new Set())
  const [projectModal, setProjectModal] = useState<{ open: boolean; project?: Project }>({ open: false })
  const [tiModal, setTiModal]           = useState<{ open: boolean; projectId?: number; item?: TechItem }>({ open: false })
  const [membersModal, setMembersModal] = useState<{ open: boolean; project?: Project }>({ open: false })
  const [backupModal, setBackupModal]   = useState<{ open: boolean; project?: Project }>({ open: false })

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects })

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: width }
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing) return
      const delta = e.clientX - dragRef.current.startX
      setWidth(Math.min(MAX_W, Math.max(MIN_W, dragRef.current.startW + delta)))
    }
    const onUp = () => {
      if (!resizing) return
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidth(w => { try { localStorage.setItem('pm_sidebarWidth', String(w)) } catch {} return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [resizing])

  const toggle = (id: number) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleDelProject = async (p: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`"${p.name}" 프로젝트를 삭제하시겠습니까?\n모든 하위 항목도 삭제됩니다.`)) return
    try {
      await deleteProject(p.id)
      qc.invalidateQueries({ queryKey: ['projects'] })
      if (selectedProjectId === p.id) { setSelectedProjectId(null); setSelectedTechItemId(null) }
      toast.success('프로젝트 삭제됨')
    } catch { toast.error('삭제 실패') }
  }

  return (
    <aside
      style={{ width: sidebarOpen ? width : 0 }}
      className={`flex-shrink-0 flex flex-col overflow-hidden relative
        bg-slate-50 dark:bg-slate-950
        border-r border-slate-200 dark:border-slate-800
        ${resizing ? '' : 'transition-[width] duration-200'}`}
    >

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3
        border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
          프로젝트
        </span>
        <button
          onClick={() => setProjectModal({ open: true })}
          title="프로젝트 추가"
          className="w-6 h-6 flex items-center justify-center rounded-md
            text-slate-400 hover:text-brand-600 hover:bg-brand-50
            dark:hover:text-brand-400 dark:hover:bg-brand-900/20
            transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {projects.map(p => (
          <ProjectNode
            key={p.id}
            project={p}
            isExpanded={expanded.has(p.id)}
            isSelected={selectedProjectId === p.id && !selectedTechItemId}
            selectedTechItemId={selectedTechItemId}
            onToggle={() => toggle(p.id)}
            onSelect={() => { setSelectedProjectId(p.id); setSelectedTechItemId(null) }}
            onEdit={e => { e.stopPropagation(); setProjectModal({ open: true, project: p }) }}
            onDelete={e => handleDelProject(p, e)}
            onAddTI={e => { e.stopPropagation(); setTiModal({ open: true, projectId: p.id }) }}
            onSelectTI={id => { setSelectedProjectId(p.id); setSelectedTechItemId(id) }}
            onEditTI={item => setTiModal({ open: true, projectId: p.id, item })}
            onMembers={e => { e.stopPropagation(); setMembersModal({ open: true, project: p }) }}
            onBackup={e => { e.stopPropagation(); setBackupModal({ open: true, project: p }) }}
          />
        ))}
        {projects.length === 0 && (
          <div className="px-3 py-8 text-center text-[12px] text-slate-400 dark:text-slate-500 leading-relaxed">
            프로젝트가 없습니다.<br />
            <button
              onClick={() => setProjectModal({ open: true })}
              className="mt-2 text-brand-500 hover:text-brand-600 font-medium"
            >
              + 새 프로젝트 만들기
            </button>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize group z-20 flex items-center justify-center"
      >
        <div className="w-0.5 h-10 rounded-full bg-slate-300 dark:bg-slate-600
          opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {projectModal.open && (
        <ProjectModal project={projectModal.project} onClose={() => setProjectModal({ open: false })} />
      )}
      {tiModal.open && tiModal.projectId && (
        <TechItemModal projectId={tiModal.projectId} item={tiModal.item} onClose={() => setTiModal({ open: false })} />
      )}
      {membersModal.open && membersModal.project && (
        <MembersModal project={membersModal.project} onClose={() => setMembersModal({ open: false })} />
      )}
      {backupModal.open && backupModal.project && (
        <BackupModal project={backupModal.project} onClose={() => setBackupModal({ open: false })} />
      )}
    </aside>
  )
}

// ── ProjectNode ──────────────────────────────────────────────────────────────
interface PNodeProps {
  project: Project
  isExpanded: boolean
  isSelected: boolean
  selectedTechItemId: number | null
  onToggle: () => void
  onSelect: () => void
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onAddTI: (e: React.MouseEvent) => void
  onSelectTI: (id: number) => void
  onEditTI: (item: TechItem) => void
  onMembers: (e: React.MouseEvent) => void
  onBackup: (e: React.MouseEvent) => void
}

function ProjectNode({
  project, isExpanded, isSelected, selectedTechItemId,
  onToggle, onSelect, onEdit, onDelete, onAddTI, onSelectTI, onEditTI,
  onMembers, onBackup,
}: PNodeProps) {
  const qc = useQueryClient()
  const isMaster = project.user_role === 'master'
  const isMember = project.user_role === 'master' || project.user_role === 'member'

  const { data: techItems = [] } = useQuery({
    queryKey: ['tech_items', project.id],
    queryFn: () => getTechItems(project.id),
    enabled: isExpanded,
  })

  // ── Drag-and-drop state ────────────────────────────────────────
  const dragItemId = useRef<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  const handleTIDragStart = (e: React.DragEvent, tiId: number) => {
    dragItemId.current = tiId
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(tiId))
  }

  const handleTIDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleTIDragEnter = (tiId: number) => setDragOverId(tiId)

  const handleTIDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    setDragOverId(null)
    const sourceId = dragItemId.current
    dragItemId.current = null
    if (!sourceId || sourceId === targetId) return

    const items = [...techItems]
    const sourceIdx = items.findIndex(t => t.id === sourceId)
    const targetIdx = items.findIndex(t => t.id === targetId)
    if (sourceIdx === -1 || targetIdx === -1) return

    const reordered = [...items]
    const [removed] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, removed)

    try {
      await reorderTechItems(project.id, reordered.map((t, i) => ({ id: t.id, order: i })))
      qc.invalidateQueries({ queryKey: ['tech_items', project.id] })
    } catch { toast.error('순서 변경 실패') }
  }

  const handleTIDragEnd = () => { dragItemId.current = null; setDragOverId(null) }

  // ─────────────────────────────────────────────────────────────

  const handleDelTI = async (ti: TechItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`"${ti.name}"을 삭제하시겠습니까?`)) return
    try {
      await deleteTechItem(ti.id)
      qc.invalidateQueries({ queryKey: ['tech_items', project.id] })
      toast.success('삭제됨')
    } catch { toast.error('삭제 실패') }
  }

  const rowBase = `
    flex items-center gap-1.5 px-2 py-[5px] rounded-lg cursor-pointer group
    text-[13px] select-none transition-colors duration-100
  `
  const activeRow = 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 font-medium'
  const normalRow = 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'

  return (
    <div>
      {/* Project row */}
      <div className={`${rowBase} ${isSelected ? activeRow : normalRow}`} onClick={onSelect}>
        <button
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 w-4 h-4 flex items-center justify-center"
          onClick={e => { e.stopPropagation(); onToggle() }}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {isSelected
          ? <FolderOpen size={14} className="flex-shrink-0 text-brand-500" />
          : <Folder size={14} className="flex-shrink-0 text-slate-400" />}
        <span className="flex-1 truncate">{project.name}</span>

        {/* Action buttons */}
        <span className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
          <ActionBtn title="멤버 관리" onClick={onMembers}><Users size={11} /></ActionBtn>
          <ActionBtn title="백업/복구" onClick={onBackup}><Archive size={11} /></ActionBtn>
          {isMaster && <ActionBtn title="편집" onClick={onEdit}><Pencil size={11} /></ActionBtn>}
          {isMember && <ActionBtn title="Tech Item 추가" onClick={onAddTI}><Plus size={11} /></ActionBtn>}
          {isMaster && <ActionBtn title="삭제" onClick={onDelete} danger><Trash2 size={11} /></ActionBtn>}
        </span>
      </div>

      {/* Tech Items */}
      {isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {techItems.map(ti => {
            const isDragOver = dragOverId === ti.id && dragItemId.current !== ti.id
            return (
              <div
                key={ti.id}
                draggable
                onDragStart={e => handleTIDragStart(e, ti.id)}
                onDragOver={handleTIDragOver}
                onDragEnter={() => handleTIDragEnter(ti.id)}
                onDrop={e => handleTIDrop(e, ti.id)}
                onDragEnd={handleTIDragEnd}
                className={`${rowBase} ${selectedTechItemId === ti.id ? activeRow : normalRow}
                  ${isDragOver ? 'ring-2 ring-brand-400 ring-inset' : ''}`}
                onClick={() => onSelectTI(ti.id)}
              >
                <GripVertical size={11}
                  className="flex-shrink-0 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing -ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <Layers size={12} className="flex-shrink-0 text-slate-400" />
                <span className="flex-1 truncate">{ti.name}</span>
                <span className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                  {isMember && <ActionBtn title="편집" onClick={e => { e.stopPropagation(); onEditTI(ti) }}><Pencil size={11} /></ActionBtn>}
                  {isMember && <ActionBtn title="삭제" onClick={e => handleDelTI(ti, e)} danger><Trash2 size={11} /></ActionBtn>}
                </span>
              </div>
            )
          })}
          {techItems.length === 0 && (
            <div className="ml-3 py-1 text-[11px] text-slate-400 dark:text-slate-500">
              Tech Item 없음
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  children, onClick, title, danger,
}: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title?: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
        danger
          ? 'hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400'
          : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
