import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addWeeks, startOfISOWeek, getISOWeek, getISOWeekYear,
  parseISO, isWithinInterval, addDays, format, getMonth, getYear,
} from 'date-fns'
import { Trash2, Plus, Pencil, Check, X as XIcon, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../contexts/AppContext'
import {
  getProjectActivities, getTechItemActivities, getTechItems,
  createActivity, updateActivity, deleteActivity,
} from '../api'
import { ActivityModal } from './modals/ActivityModal'
import type { Activity, TechItem } from '../types'

// ── Column definitions ────────────────────────────────────────────────────────
const COLS = [
  { key: 'tech_item_id',    label: 'Tech Item', w: 112 },
  { key: 'name',            label: 'Activity',  w: 150 },
  { key: 'start_date',      label: '시작일',    w: 88  },
  { key: 'end_date',        label: '종료일',    w: 88  },
  { key: 'completion_date', label: '완료일',    w: 88  },
  { key: 'assignee',        label: '담당자',    w: 84  },
  { key: 'status',          label: '상태',      w: 74  },
  { key: 'notes',           label: '메모',      w: 120 },
] as const

const ACTION_W = 76
const WEEK_W   = 32

function colLeft(i: number) {
  let l = ACTION_W
  for (let j = 0; j < i; j++) l += COLS[j].w
  return l
}

const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

const STATUS_LABEL: Record<string,string> = { review:'검토', in_progress:'진행', complete:'완료' }
const STATUS_CHIP:  Record<string,string>  = { review:'chip-review', in_progress:'chip-progress', complete:'chip-complete' }
const BAR_GRAD:     Record<string,[string,string]> = {
  review:     ['#f59e0b','#fbbf24'],
  in_progress:['#3b82f6','#60a5fa'],
  complete:   ['#10b981','#34d399'],
}

// ── Drag state ────────────────────────────────────────────────────────────────
interface DragState {
  activityId: number
  type: 'start' | 'end' | 'move'
  startX: number
  origStartDate: string | null
  origEndDate: string | null
  currentWeekDelta: number
}

// ── Week helpers ──────────────────────────────────────────────────────────────
interface WeekInfo { year: number; month: number; week: number; monday: Date }

function generateWeeks(activities: Activity[], buf = 3): WeekInfo[] {
  const dates: Date[] = []
  activities.forEach(a => {
    if (a.start_date)      dates.push(parseISO(a.start_date))
    if (a.end_date)        dates.push(parseISO(a.end_date))
    if (a.completion_date) dates.push(parseISO(a.completion_date))
  })
  const now = new Date()
  const min = dates.length ? dates.reduce((a,b)=>a<b?a:b) : addWeeks(now,-6)
  const max = dates.length ? dates.reduce((a,b)=>a>b?a:b) : addWeeks(now,10)
  const start = startOfISOWeek(addWeeks(min,-buf))
  const end   = startOfISOWeek(addWeeks(max, buf))
  const weeks: WeekInfo[] = []
  let cur = start
  while (cur <= end) {
    const wed = addDays(cur, 2)
    weeks.push({ year: getYear(wed), month: getMonth(wed), week: getISOWeek(cur), monday: cur })
    cur = addWeeks(cur, 1)
  }
  return weeks
}

interface Group { key: string; label: string; count: number }

function buildYearGroups(weeks: WeekInfo[]): Group[] {
  const res: Group[] = []; let cur='',cnt=0
  weeks.forEach(w => {
    const k = String(w.year)
    if (k!==cur) { if(cur) res.push({key:cur,label:`${cur}년`,count:cnt}); cur=k; cnt=1 } else cnt++
  })
  if (cur) res.push({key:cur,label:`${cur}년`,count:cnt})
  return res
}

function buildMonthGroups(weeks: WeekInfo[]): Group[] {
  const res: Group[] = []; let cur='',cnt=0
  weeks.forEach(w => {
    const k = `${w.year}-${w.month}`
    if (k!==cur) {
      if (cur) res.push({key:cur,label:MONTHS_KO[weeks.find(x=>`${x.year}-${x.month}`===cur)!.month],count:cnt})
      cur=k; cnt=1
    } else cnt++
  })
  if (cur) { const s=weeks.find(x=>`${x.year}-${x.month}`===cur)!; res.push({key:cur,label:MONTHS_KO[s.month],count:cnt}) }
  return res
}

interface CellState { inRange:boolean; isStart:boolean; isEnd:boolean; isCompletion:boolean }

function cellState(a: Activity, w: WeekInfo): CellState {
  const mon=w.monday, sun=addDays(mon,6)
  const inWeek=(s:string|null)=>!!s&&isWithinInterval(parseISO(s),{start:mon,end:sun})
  return {
    inRange: a.start_date&&a.end_date ? !(parseISO(a.end_date)<mon)&&!(parseISO(a.start_date)>sun) : false,
    isStart:      inWeek(a.start_date),
    isEnd:        inWeek(a.end_date),
    isCompletion: inWeek(a.completion_date),
  }
}

// ── Draft row ─────────────────────────────────────────────────────────────────
interface DraftRow {
  _id:string; tech_item_id:number|null; name:string
  start_date:string; end_date:string; completion_date:string
  assignee:string; status:string; notes:string
}
function emptyDraft(techItems: TechItem[], tiId: number|null): DraftRow {
  const today    = format(new Date(), 'yyyy-MM-dd')
  const nextWeek = format(addWeeks(new Date(), 1), 'yyyy-MM-dd')
  return { _id:`draft-${Date.now()}-${Math.random()}`, tech_item_id:tiId??techItems[0]?.id??null,
           name:'',start_date:today,end_date:nextWeek,completion_date:'',assignee:'',status:'review',notes:'' }
}

// ── Inline-edit hook ──────────────────────────────────────────────────────────
interface EditKey { id:number; field:string }

function buildPatch(a: Activity, field: string, value: string): any {
  const p: any = { tech_item_id:a.tech_item_id, name:a.name, start_date:a.start_date, end_date:a.end_date,
    completion_date:a.completion_date, assignee:a.assignee, status:a.status, notes:a.notes, order:a.order, version:a.version }
  if (field==='tech_item_id') { p.tech_item_id=Number(value)||a.tech_item_id }
  else if (['start_date','end_date','completion_date'].includes(field)) {
    p[field]=value||null; if (field==='completion_date'&&value) p.status='complete'
  } else if (field==='name') { p.name=value.trim()||a.name }
  else { p[field]=value||null }
  return p
}

function useInlineEdit(projectId:number|null, techItemId:number|null) {
  const qc = useQueryClient()
  const [editing,setEditing] = useState<EditKey|null>(null)
  const [draft,setDraft]     = useState('')

  const invalidate = useCallback(()=>{
    if(projectId)  qc.invalidateQueries({queryKey:['activities','project',projectId]})
    if(techItemId) qc.invalidateQueries({queryKey:['activities','ti',techItemId]})
  },[qc,projectId,techItemId])

  const mut = useMutation({
    mutationFn:({id,patch}:{id:number;patch:any})=>updateActivity(id,patch),
    onSuccess:()=>{ invalidate(); setEditing(null) },
    onError:(e:any)=>{ toast.error(e.response?.data?.detail??'저장 실패'); setEditing(null) },
  })

  const startEdit  = useCallback((a:Activity,f:string)=>{ setEditing({id:a.id,field:f}); setDraft(String((a as any)[f]??'')) },[])
  const commitEdit = useCallback((a:Activity)=>{ if(!editing||editing.id!==a.id) return; mut.mutate({id:a.id,patch:buildPatch(a,editing.field,draft)}) },[editing,draft,mut])
  const saveField  = useCallback((a:Activity,f:string,v:string)=>{ mut.mutate({id:a.id,patch:buildPatch(a,f,v)}) },[mut])
  const cancelEdit = useCallback(()=>setEditing(null),[])
  return { editing, draft, setDraft, startEdit, commitEdit, saveField, cancelEdit }
}

// ── GanttChart ────────────────────────────────────────────────────────────────
export function GanttChart() {
  const { selectedProjectId, selectedTechItemId } = useApp()
  const qc = useQueryClient()
  const [actModal,  setActModal]  = useState<{open:boolean;activity?:Activity}>({open:false})
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])
  const savingRef   = useRef<Set<string>>(new Set())
  const fixedRef    = useRef<Set<number>>(new Set())

  // ── Drag state (ref for stable closure + state for re-render) ──
  const [dragging,    setDraggingState] = useState<DragState|null>(null)
  const draggingRef   = useRef<DragState|null>(null)
  const activitiesRef = useRef<Activity[]>([])

  const setDragging = useCallback((d: DragState|null)=>{
    draggingRef.current = d; setDraggingState(d)
  },[])

  const { data: activities = [], isLoading } = useQuery({
    queryKey: selectedTechItemId ? ['activities','ti',selectedTechItemId] : ['activities','project',selectedProjectId],
    queryFn:  ()=> selectedTechItemId ? getTechItemActivities(selectedTechItemId) : getProjectActivities(selectedProjectId!),
    enabled:  !!(selectedProjectId||selectedTechItemId),
  })

  const { data: techItems = [] } = useQuery({
    queryKey: ['tech_items', selectedProjectId],
    queryFn:  ()=>getTechItems(selectedProjectId!),
    enabled:  !!selectedProjectId,
  })

  const tiMap      = useMemo(()=>Object.fromEntries(techItems.map(t=>[t.id,t.name])),[techItems])
  const tiOrderMap = useMemo(()=>Object.fromEntries(techItems.map(t=>[t.id,t.order])),[techItems])

  const sorted = useMemo(()=>[...activities].sort((a,b)=>{
    const oa=tiOrderMap[a.tech_item_id]??999, ob=tiOrderMap[b.tech_item_id]??999
    if(oa!==ob) return oa-ob
    if(a.tech_item_id!==b.tech_item_id) return a.tech_item_id-b.tech_item_id
    if(!a.start_date&&!b.start_date) return 0
    if(!a.start_date) return 1; if(!b.start_date) return -1
    return a.start_date<b.start_date?-1:a.start_date>b.start_date?1:0
  }),[activities,tiOrderMap])

  activitiesRef.current = sorted

  const invalidate = useCallback(()=>{
    if(selectedProjectId)  qc.invalidateQueries({queryKey:['activities','project',selectedProjectId]})
    if(selectedTechItemId) qc.invalidateQueries({queryKey:['activities','ti',selectedTechItemId]})
  },[qc,selectedProjectId,selectedTechItemId])

  // ── Auto-fix: completion_date present but status != complete ──
  const fixRef = useRef<Set<number>>(new Set())
  useEffect(()=>{
    const toFix = activities.filter(a=>a.completion_date&&a.status!=='complete'&&!fixRef.current.has(a.id))
    if (!toFix.length) return
    toFix.forEach(a=>fixRef.current.add(a.id))
    Promise.all(toFix.map(a=>updateActivity(a.id,{
      tech_item_id:a.tech_item_id,name:a.name,start_date:a.start_date,end_date:a.end_date,
      completion_date:a.completion_date,assignee:a.assignee,status:'complete',notes:a.notes,order:a.order,version:a.version,
    }).catch(()=>fixRef.current.delete(a.id))
    )).then(()=>{ invalidate(); if(toFix.length) toast.success(`${toFix.length}개 상태 자동 보정`) })
  },[activities])

  const weeks   = useMemo(()=>generateWeeks(sorted),[sorted])
  const yGroups = useMemo(()=>buildYearGroups(weeks),[weeks])
  const mGroups = useMemo(()=>buildMonthGroups(weeks),[weeks])
  const nowW    = useMemo(()=>({y:getISOWeekYear(new Date()),w:getISOWeek(new Date())}),[])

  const { editing, draft, setDraft, startEdit, commitEdit, saveField, cancelEdit } =
    useInlineEdit(selectedProjectId, selectedTechItemId)

  const delMut = useMutation({
    mutationFn:(id:number)=>deleteActivity(id),
    onSuccess:()=>{ invalidate(); toast.success('삭제됨') },
    onError:()=>toast.error('삭제 실패'),
  })

  const dragSaveMut = useMutation({
    mutationFn:({a,s,e}:{a:Activity;s:string|null;e:string|null})=>
      updateActivity(a.id,{tech_item_id:a.tech_item_id,name:a.name,start_date:s,end_date:e,
        completion_date:a.completion_date,assignee:a.assignee,status:a.status,notes:a.notes,order:a.order,version:a.version}),
    onSuccess:()=>invalidate(),
    onError:(err:any)=>toast.error(err.response?.data?.detail??'날짜 변경 실패'),
  })

  // ── Global drag mouse handlers ────────────────────────────────
  useEffect(()=>{
    const onMove=(e:MouseEvent)=>{
      const d=draggingRef.current; if(!d) return
      const wkDelta=Math.round((e.clientX-d.startX)/WEEK_W)
      if(wkDelta!==d.currentWeekDelta) {
        const nd={...d,currentWeekDelta:wkDelta}; draggingRef.current=nd; setDraggingState(nd)
      }
    }
    const onUp=()=>{
      const d=draggingRef.current; if(!d) return
      draggingRef.current=null; setDraggingState(null)
      document.body.style.cursor=''; document.body.style.userSelect=''
      if(d.currentWeekDelta===0) return
      const a=activitiesRef.current.find(x=>x.id===d.activityId); if(!a) return
      const shift=(dt:string|null)=>dt?format(addWeeks(parseISO(dt),d.currentWeekDelta),'yyyy-MM-dd'):null
      let ns=a.start_date, ne=a.end_date
      if(d.type==='start')      ns=shift(d.origStartDate)
      else if(d.type==='end')   ne=shift(d.origEndDate)
      else { ns=shift(d.origStartDate); ne=shift(d.origEndDate) }
      if(ns&&ne&&ns>ne){ toast.error('시작일이 종료일보다 클 수 없습니다'); return }
      dragSaveMut.mutate({a,s:ns,e:ne})
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return ()=>{ window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp) }
  },[]) // stable via refs

  const handleDragStart = useCallback((a:Activity, type:DragState['type'], startX:number, e:React.MouseEvent)=>{
    e.preventDefault(); e.stopPropagation()
    const cursor = type==='move' ? 'grabbing' : 'col-resize'
    document.body.style.cursor=cursor; document.body.style.userSelect='none'
    const d:DragState={ activityId:a.id, type, startX, origStartDate:a.start_date, origEndDate:a.end_date, currentWeekDelta:0 }
    draggingRef.current=d; setDraggingState(d)
  },[])

  // Preview: compute temporary dates while dragging
  const previewAct = useCallback((a:Activity):Activity=>{
    const d=dragging; if(!d||d.activityId!==a.id||d.currentWeekDelta===0) return a
    const shift=(dt:string|null)=>dt?format(addWeeks(parseISO(dt),d.currentWeekDelta),'yyyy-MM-dd'):null
    if(d.type==='start') return {...a,start_date:shift(d.origStartDate)}
    if(d.type==='end')   return {...a,end_date:shift(d.origEndDate)}
    return {...a,start_date:shift(d.origStartDate),end_date:shift(d.origEndDate)}
  },[dragging])

  // ── Draft management ──────────────────────────────────────────
  const addDraftRow   = (tiId?:number)=>setDraftRows(prev=>[...prev,{...emptyDraft(techItems,selectedTechItemId),tech_item_id:tiId??selectedTechItemId??techItems[0]?.id??null}])
  const updateDraft   = (id:string,u:Partial<DraftRow>)=>setDraftRows(prev=>prev.map(r=>r._id===id?{...r,...u}:r))
  const removeDraft   = (id:string)=>setDraftRows(prev=>prev.filter(r=>r._id!==id))
  const saveDraft = async(d:DraftRow)=>{
    if(!d.name.trim())   return toast.error('Activity명을 입력하세요')
    if(!d.tech_item_id)  return toast.error('Tech Item을 선택하세요')
    if(savingRef.current.has(d._id)) return
    savingRef.current.add(d._id)
    try {
      await createActivity({tech_item_id:d.tech_item_id,name:d.name,start_date:d.start_date||null,end_date:d.end_date||null,
        completion_date:d.completion_date||null,assignee:d.assignee,status:d.status as any,notes:d.notes,order:0})
      removeDraft(d._id); invalidate(); toast.success('Activity 추가됨')
    } catch(e:any){ toast.error(e.response?.data?.detail??'저장 실패')
    } finally{ savingRef.current.delete(d._id) }
  }

  const downloadCSV = useCallback(()=>{
    const headers = ['Tech Item','Activity','시작일','종료일','완료일','담당자','상태','메모']
    const rows = sorted.map(a=>[
      tiMap[a.tech_item_id]??'', a.name,
      a.start_date??'', a.end_date??'', a.completion_date??'',
      a.assignee??'', STATUS_LABEL[a.status]??a.status, a.notes??'',
    ])
    const csv = [headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href=url; el.download='activities.csv'; el.click(); URL.revokeObjectURL(url)
  },[sorted,tiMap])

  // ── Empty / loading ───────────────────────────────────────────
  if(!selectedProjectId&&!selectedTechItemId) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl">📂</div>
        <p className="text-slate-500 dark:text-slate-400 text-sm">사이드바에서 프로젝트 또는 Tech Item을 선택하세요.</p>
      </div>
    </div>
  )
  if(isLoading) return <div className="flex-1 flex items-center justify-center"><div className="text-slate-400 text-sm animate-pulse">로딩 중...</div></div>

  const TOP_YEAR=0, TOP_MONTH=26, TOP_WEEK=50
  const thBase='border-b border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap select-none text-center'

  // ── Drag tooltip ──────────────────────────────────────────────
  const DragTooltip = ()=>{
    if (!dragging||dragging.currentWeekDelta===0) return null
    const a=sorted.find(x=>x.id===dragging.activityId); if(!a) return null
    const shift=(dt:string|null)=>dt?format(addWeeks(parseISO(dt),dragging.currentWeekDelta),'MM/dd'):null
    const label = dragging.type==='start' ? `시작: ${shift(dragging.origStartDate)}`
      : dragging.type==='end' ? `종료: ${shift(dragging.origEndDate)}`
      : `${shift(dragging.origStartDate)} ~ ${shift(dragging.origEndDate)}`
    return (
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5
        bg-slate-800 dark:bg-slate-700 text-white text-[12px] rounded-lg shadow-xl
        border border-slate-600 pointer-events-none whitespace-nowrap">
        <span className="font-medium text-slate-300 mr-1.5">{a.name}</span>{label}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900 relative">
      <DragTooltip/>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
          {sorted.length}개 Activity
          {draftRows.length>0&&(
            <span className="ml-1.5 px-1.5 py-0.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded text-[11px]">+{draftRows.length} 작성중</span>
          )}
        </span>
        <span className="text-[11px] text-slate-400 hidden md:block">· 바를 드래그하여 날짜 조정</span>
        <div className="ml-auto flex gap-2">
          <button onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <Download size={13}/> CSV 다운로드
          </button>
          <button onClick={()=>setActModal({open:true})}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors">
            <Plus size={13}/> Activity 추가
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`flex-1 overflow-auto mx-4 my-3 rounded-xl border border-slate-200 dark:border-slate-700 ${dragging?'select-none':''}`}>
        <table style={{tableLayout:'fixed',borderCollapse:'collapse',minWidth:ACTION_W+COLS.reduce((s,c)=>s+c.w,0)+weeks.length*WEEK_W}}>
          <colgroup>
            <col style={{width:ACTION_W}}/>
            {COLS.map(c=><col key={c.key} style={{width:c.w}}/>)}
            {weeks.map(w=><col key={`${w.year}-${w.week}`} style={{width:WEEK_W}}/>)}
          </colgroup>

          <thead>
            <tr style={{height:26}}>
              <th rowSpan={3} className={`${thBase} sticky z-30`} style={{left:0,width:ACTION_W,top:TOP_YEAR}}>
                <button
                  onClick={()=>addDraftRow()}
                  title="행 추가"
                  className="w-7 h-7 flex items-center justify-center rounded-lg mx-auto
                    text-slate-400 hover:text-brand-600 hover:bg-brand-50
                    dark:hover:text-brand-400 dark:hover:bg-brand-900/30 transition-colors">
                  <Plus size={13}/>
                </button>
              </th>
              {COLS.map((c,i)=>(
                <th key={c.key} rowSpan={3} className={`${thBase} sticky z-30 px-2`}
                  style={{left:colLeft(i),width:c.w,top:TOP_YEAR}}>{c.label}</th>
              ))}
              {yGroups.map(yg=>(
                <th key={yg.key} colSpan={yg.count} className={`${thBase} sticky z-20 px-2`}
                  style={{top:TOP_YEAR}}>{yg.label}</th>
              ))}
            </tr>
            <tr style={{height:24}}>
              {mGroups.map(mg=>(
                <th key={mg.key} colSpan={mg.count} className={`${thBase} sticky z-20 px-1`}
                  style={{top:TOP_MONTH}}>{mg.label}</th>
              ))}
            </tr>
            <tr style={{height:22}}>
              {weeks.map(w=>{
                const isCur=w.year===nowW.y&&w.week===nowW.w
                return (
                  <th key={`${w.year}-${w.week}`} className={`${thBase} sticky z-20`}
                    style={{top:TOP_WEEK,width:WEEK_W,...(isCur?{background:'#eff6ff',color:'#2563eb'}:{})}}
                    title={format(w.monday,'MM/dd')}>{w.week}</th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {sorted.length===0&&draftRows.length===0&&(
              <tr><td colSpan={1+COLS.length+weeks.length}
                className="text-center py-16 text-slate-400 text-sm border-b border-slate-200 dark:border-slate-700">
                Activity가 없습니다.
              </td></tr>
            )}

            {sorted.map((a,idx)=>{
              const rowBg=idx%2===0?'':'bg-slate-50/60 dark:bg-slate-800/30'
              const stickyBg=idx%2===0?'bg-white dark:bg-slate-900':'bg-slate-50 dark:bg-slate-800'
              const completionMissing=a.status==='complete'&&!a.completion_date
              const isDraggingThis=dragging?.activityId===a.id
              const pa=previewAct(a) // preview dates during drag

              return (
                <tr key={a.id}
                  className={`group ${rowBg} ${!dragging?'hover:bg-brand-50/40 dark:hover:bg-brand-900/10':''} transition-colors`}
                  style={{height:36}}>

                  {/* Action buttons */}
                  <td className={`border-b border-r border-slate-200 dark:border-slate-700 text-[11px] overflow-hidden h-9 sticky z-10 ${stickyBg}`}
                    style={{left:0,width:ACTION_W}}>
                    <div className="flex items-center justify-center gap-0.5 h-full px-1">
                      <ActionBtn title="행 추가 (같은 Tech Item)" onClick={()=>addDraftRow(a.tech_item_id)}
                        color="text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Plus size={11}/>
                      </ActionBtn>
                      <ActionBtn title="편집" onClick={()=>setActModal({open:true,activity:a})}
                        color="text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30">
                        <Pencil size={11}/>
                      </ActionBtn>
                      <ActionBtn title="삭제" onClick={()=>confirm(`"${a.name}"을 삭제하시겠습니까?`)&&delMut.mutate(a.id)}
                        color="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 size={11}/>
                      </ActionBtn>
                    </div>
                  </td>

                  <EditSelectCell activity={a} techItems={techItems} tiMap={tiMap}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} saveField={saveField} cancelEdit={cancelEdit}
                    style={{left:colLeft(0),width:COLS[0].w}} bgClass={stickyBg}/>
                  <EditTextCell value={a.name} field="name" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(1),width:COLS[1].w}} sticky bgClass={stickyBg}/>
                  <EditDateCell field="start_date" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(2),width:COLS[2].w}} sticky bgClass={stickyBg}
                    previewValue={isDraggingThis&&dragging.type!=='end'?pa.start_date:undefined}/>
                  <EditDateCell field="end_date" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(3),width:COLS[3].w}} sticky bgClass={stickyBg}
                    previewValue={isDraggingThis&&dragging.type!=='start'?pa.end_date:undefined}/>
                  <EditDateCell field="completion_date" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(4),width:COLS[4].w}} sticky warnEmpty={completionMissing} bgClass={stickyBg}/>
                  <EditTextCell value={a.assignee} field="assignee" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(5),width:COLS[5].w}} sticky bgClass={stickyBg}/>
                  <EditStatusCell activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(6),width:COLS[6].w}} sticky bgClass={stickyBg}/>
                  <EditTextCell value={a.notes} field="notes" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(7),width:COLS[7].w}} sticky bgClass={stickyBg}/>

                  {/* Timeline cells */}
                  {weeks.map(w=>{
                    const cs=cellState(pa,w) // use preview dates
                    const hasBar=cs.inRange||cs.isStart||cs.isEnd
                    const isCurWeek=w.year===nowW.y&&w.week===nowW.w
                    const [c1,c2]=BAR_GRAD[a.status]??BAR_GRAD.review

                    return (
                      <td key={`${w.year}-${w.week}`}
                        className={`border-b border-r border-slate-200 dark:border-slate-700 relative p-0 ${isCurWeek?'bg-brand-50/40 dark:bg-brand-900/10':''}`}
                        style={{width:WEEK_W,height:36}}>
                        {isCurWeek&&<div className="absolute inset-y-0 left-1/2 -translate-x-px w-px bg-brand-300 opacity-40"/>}

                        {hasBar&&(
                          <div
                            className={`absolute left-0 right-0 mx-px transition-opacity ${isDraggingThis?'opacity-60':''}`}
                            style={{
                              top:'20%',bottom:'20%',
                              borderRadius:cs.isStart&&cs.isEnd?4:cs.isStart?'4px 0 0 4px':cs.isEnd?'0 4px 4px 0':0,
                              background:`linear-gradient(135deg,${c1},${c2})`,opacity:isDraggingThis?.6:.85,
                              marginLeft:cs.isStart?2:0,marginRight:cs.isEnd?2:0,
                            }}>
                            {/* Left resize handle */}
                            {cs.isStart&&!cs.isCompletion&&(
                              <div className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-20 group/hdl"
                                onMouseDown={e=>handleDragStart(a,'start',e.clientX,e)}>
                                <div className="absolute left-0.5 top-1/4 bottom-1/4 w-0.5 rounded-full bg-white/60 group-hover/hdl:bg-white transition-colors"/>
                              </div>
                            )}
                            {/* Right resize handle */}
                            {cs.isEnd&&!cs.isCompletion&&(
                              <div className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-20 group/hdl"
                                onMouseDown={e=>handleDragStart(a,'end',e.clientX,e)}>
                                <div className="absolute right-0.5 top-1/4 bottom-1/4 w-0.5 rounded-full bg-white/60 group-hover/hdl:bg-white transition-colors"/>
                              </div>
                            )}
                            {/* Move handle (middle area) */}
                            {!cs.isCompletion&&(
                              <div className={`absolute cursor-grab active:cursor-grabbing z-10`}
                                style={{left:cs.isStart?12:0,right:cs.isEnd?12:0,top:0,bottom:0}}
                                onMouseDown={e=>handleDragStart(a,'move',e.clientX,e)}/>
                            )}
                          </div>
                        )}

                        {/* Completion marker */}
                        {cs.isCompletion&&(
                          <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center shadow-sm">
                              <span className="text-white text-[8px] font-bold">✓</span>
                            </div>
                          </div>
                        )}
                        {!cs.isCompletion&&cs.isStart&&!hasBar&&(
                          <div className="absolute top-1/2 -translate-y-1/2 left-1 z-10 w-1.5 h-1.5 rounded-full bg-slate-400"/>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Draft rows */}
            {draftRows.map((d,di)=>(
              <DraftActivityRow key={d._id} draft={d} techItems={techItems} weeks={weeks}
                onUpdate={u=>updateDraft(d._id,u)} onSave={()=>saveDraft(d)} onCancel={()=>removeDraft(d._id)}
                rowIndex={sorted.length+di}/>
            ))}
          </tbody>
        </table>
      </div>

      {actModal.open&&selectedProjectId&&(
        <ActivityModal projectId={selectedProjectId} defaultTechItemId={selectedTechItemId??undefined}
          activity={actModal.activity} onClose={()=>setActModal({open:false})}/>
      )}
    </div>
  )
}

// ── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({children,onClick,title,color}:{children:React.ReactNode;onClick:()=>void;title?:string;color:string}) {
  return (
    <button title={title} onClick={onClick}
      className={`w-[22px] h-[22px] flex items-center justify-center rounded-md transition-colors flex-shrink-0 ${color}`}>
      {children}
    </button>
  )
}

// ── DraftActivityRow ──────────────────────────────────────────────────────────
function DraftActivityRow({draft,techItems,weeks,onUpdate,onSave,onCancel,rowIndex}:{
  draft:DraftRow;techItems:TechItem[];weeks:WeekInfo[];
  onUpdate:(u:Partial<DraftRow>)=>void;onSave:()=>void;onCancel:()=>void;rowIndex:number;
}) {
  const rowBg=rowIndex%2===0?'':'bg-slate-50/60 dark:bg-slate-800/30'
  const stickyBg=rowIndex%2===0?'bg-white dark:bg-slate-900':'bg-slate-50 dark:bg-slate-800'
  const inp=`w-full h-full px-1.5 text-[11px] bg-transparent border-none outline-none focus:bg-brand-50/60 dark:focus:bg-brand-900/20 text-slate-700 dark:text-slate-300`
  const kd=(e:React.KeyboardEvent)=>{ if(e.key==='Enter'){e.preventDefault();onSave()} if(e.key==='Escape'){e.preventDefault();onCancel()} }
  const upd=(f:keyof DraftRow,v:string|number|null)=>{ const u:Partial<DraftRow>={[f]:v}; if(f==='completion_date'&&v) u.status='complete'; onUpdate(u) }
  const td=`border-b border-r border-brand-200 dark:border-brand-700 sticky z-10 p-0 ${stickyBg}`
  return (
    <tr className={`${rowBg} ring-1 ring-inset ring-brand-200 dark:ring-brand-700`} style={{height:36}}>
      <td className={td} style={{left:0,width:ACTION_W}}>
        <div className="flex items-center justify-center gap-1 h-full">
          <button onClick={onSave} className="w-6 h-6 flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"><Check size={12}/></button>
          <button onClick={onCancel} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><XIcon size={12}/></button>
        </div>
      </td>
      <td className={td} style={{left:colLeft(0),width:COLS[0].w}}>
        <select className={`${inp} cursor-pointer`} value={draft.tech_item_id??''} onKeyDown={kd} onChange={e=>upd('tech_item_id',Number(e.target.value))}>
          <option value="">선택...</option>
          {techItems.map(ti=><option key={ti.id} value={ti.id}>{ti.name}</option>)}
        </select>
      </td>
      <td className={td} style={{left:colLeft(1),width:COLS[1].w}}>
        <input autoFocus className={inp} placeholder="Activity명..." value={draft.name} onKeyDown={kd} onChange={e=>upd('name',e.target.value)}/>
      </td>
      <td className={td} style={{left:colLeft(2),width:COLS[2].w}}>
        <input type="date" className={inp} value={draft.start_date} onKeyDown={kd} onChange={e=>upd('start_date',e.target.value)}/>
      </td>
      <td className={td} style={{left:colLeft(3),width:COLS[3].w}}>
        <input type="date" className={inp} value={draft.end_date} onKeyDown={kd} onChange={e=>upd('end_date',e.target.value)}/>
      </td>
      <td className={`${td} ${draft.status==='complete'&&!draft.completion_date?'ring-1 ring-inset ring-red-400':''}`} style={{left:colLeft(4),width:COLS[4].w}}>
        <input type="date" className={inp} value={draft.completion_date} onKeyDown={kd} onChange={e=>upd('completion_date',e.target.value)}/>
      </td>
      <td className={td} style={{left:colLeft(5),width:COLS[5].w}}>
        <input className={inp} placeholder="담당자" value={draft.assignee} onKeyDown={kd} onChange={e=>upd('assignee',e.target.value)}/>
      </td>
      <td className={td} style={{left:colLeft(6),width:COLS[6].w}}>
        <select className={`${inp} cursor-pointer`} value={draft.status} onKeyDown={kd} onChange={e=>upd('status',e.target.value)}>
          <option value="review">검토</option>
          <option value="in_progress">진행</option>
          <option value="complete">완료</option>
        </select>
      </td>
      <td className={td} style={{left:colLeft(7),width:COLS[7].w}}>
        <input className={inp} placeholder="메모" value={draft.notes} onKeyDown={kd} onChange={e=>upd('notes',e.target.value)}/>
      </td>
      {weeks.map(w=>(
        <td key={`${w.year}-${w.week}`} className="border-b border-r border-brand-100 dark:border-brand-900/30" style={{width:WEEK_W}}/>
      ))}
    </tr>
  )
}

// ── Editable cell components ──────────────────────────────────────────────────
const sTd='border-b border-r border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 overflow-hidden h-9 sticky z-10'

interface ECBase { activity:Activity; field:string; editing:{id:number;field:string}|null; draft:string; setDraft:(v:string)=>void; startEdit:(a:Activity,f:string)=>void; commitEdit:(a:Activity)=>void; cancelEdit:()=>void; style:React.CSSProperties; sticky?:boolean; warnEmpty?:boolean; previewValue?: string|null; bgClass?:string }

function EditTextCell({value,activity,field,editing,draft,setDraft,startEdit,commitEdit,cancelEdit,style,warnEmpty,bgClass}:ECBase&{value:string}) {
  const isE=editing?.id===activity.id&&editing.field===field
  return (
    <td className={`${sTd} cursor-text ${warnEmpty?'ring-1 ring-inset ring-red-400':''} ${bgClass??'bg-white dark:bg-slate-900'}`} style={style} onClick={()=>!isE&&startEdit(activity,field)}>
      {isE ? <input autoFocus className="gcell-input" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>commitEdit(activity)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(activity);if(e.key==='Escape')cancelEdit()}}/>
           : <span className="block truncate px-2 leading-9">{value||<span className="text-slate-300 dark:text-slate-600">—</span>}</span>}
    </td>
  )
}

function EditDateCell({activity,field,editing,draft,setDraft,startEdit,commitEdit,cancelEdit,style,warnEmpty,previewValue,bgClass}:ECBase) {
  const isE=editing?.id===activity.id&&editing.field===field
  const val=(activity as any)[field] as string|null
  const showVal = previewValue !== undefined ? previewValue : val
  const display=showVal?format(parseISO(showVal),'yy-MM-dd'):''
  const isPreview = previewValue !== undefined && previewValue !== val
  return (
    <td className={`${sTd} cursor-text text-center ${warnEmpty?'ring-1 ring-inset ring-red-400':''} ${isPreview?'text-brand-600 dark:text-brand-400 font-semibold':''} ${bgClass??'bg-white dark:bg-slate-900'}`}
      style={style} onClick={()=>!isE&&startEdit(activity,field)}>
      {isE ? <input type="date" autoFocus className="gcell-input text-center" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>commitEdit(activity)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(activity);if(e.key==='Escape')cancelEdit()}}/>
           : <span className="block px-1 leading-9">{display||<span className="text-slate-300 dark:text-slate-600">—</span>}</span>}
    </td>
  )
}

function EditStatusCell({activity,editing,draft,setDraft,startEdit,commitEdit,cancelEdit,style,bgClass}:Omit<ECBase,'field'>) {
  const field='status'; const isE=editing?.id===activity.id&&editing.field===field
  return (
    <td className={`${sTd} cursor-pointer text-center ${bgClass??'bg-white dark:bg-slate-900'}`} style={style} onClick={()=>!isE&&startEdit(activity,field)}>
      {isE ? <select autoFocus className="gcell-input" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>commitEdit(activity)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(activity);if(e.key==='Escape')cancelEdit()}}>
               <option value="review">검토</option><option value="in_progress">진행</option><option value="complete">완료</option>
             </select>
           : <span className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[activity.status]??STATUS_CHIP.review}`}>{STATUS_LABEL[activity.status]??activity.status}</span>}
    </td>
  )
}

function EditSelectCell({activity,techItems,tiMap,editing,draft,setDraft,startEdit,saveField,cancelEdit,style,bgClass}:{
  activity:Activity;techItems:TechItem[];tiMap:Record<number,string>;editing:{id:number;field:string}|null;draft:string;setDraft:(v:string)=>void;startEdit:(a:Activity,f:string)=>void;saveField:(a:Activity,f:string,v:string)=>void;cancelEdit:()=>void;style:React.CSSProperties;bgClass?:string;
}) {
  const field='tech_item_id'; const isE=editing?.id===activity.id&&editing.field===field
  return (
    <td className={`${sTd} cursor-pointer ${bgClass??'bg-white dark:bg-slate-900'}`} style={style} onClick={()=>!isE&&startEdit(activity,field)}>
      {isE ? <select autoFocus className="gcell-input cursor-pointer" value={draft}
                onChange={e=>{ setDraft(e.target.value); saveField(activity,field,e.target.value) }}
                onBlur={cancelEdit} onKeyDown={e=>{if(e.key==='Escape')cancelEdit()}}>
               {techItems.map(ti=><option key={ti.id} value={ti.id}>{ti.name}</option>)}
             </select>
           : <span className="block truncate px-2 leading-9 text-slate-500 dark:text-slate-400">{tiMap[activity.tech_item_id]??'—'}</span>}
    </td>
  )
}
