import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addWeeks, startOfISOWeek, getISOWeek, getISOWeekYear,
  parseISO, isWithinInterval, addDays, format, getMonth, getYear,
  startOfMonth, endOfMonth, addMonths,
} from 'date-fns'
import { Trash2, Plus, Pencil, Check, X as XIcon, AlertTriangle, PanelLeftClose, PanelLeftOpen, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../contexts/AppContext'
import {
  getProjectActivities, getTechItemActivities, getTechItems,
  createActivity, updateActivity, deleteActivity, getMembers, createTechItem, reorderTechItems,
} from '../api'
import { ActivityModal } from './modals/ActivityModal'
import type { Activity, TechItem, Member } from '../types'

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
const MONTH_W  = 60

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

// ── Month helpers ─────────────────────────────────────────────────────────────
interface MonthInfo { year: number; month: number; firstDay: Date; lastDay: Date }

function generateMonths(activities: Activity[], buf = 2): MonthInfo[] {
  const dates: Date[] = []
  activities.forEach(a => {
    if (a.start_date)      dates.push(parseISO(a.start_date))
    if (a.end_date)        dates.push(parseISO(a.end_date))
    if (a.completion_date) dates.push(parseISO(a.completion_date))
  })
  const now = new Date()
  const min = dates.length ? dates.reduce((a,b)=>a<b?a:b) : addMonths(now,-3)
  const max = dates.length ? dates.reduce((a,b)=>a>b?a:b) : addMonths(now,6)
  const start = startOfMonth(addMonths(min,-buf))
  const end   = startOfMonth(addMonths(max, buf))
  const months: MonthInfo[] = []
  let cur = start
  while (cur <= end) {
    months.push({ year:getYear(cur), month:getMonth(cur), firstDay:startOfMonth(cur), lastDay:endOfMonth(cur) })
    cur = addMonths(cur, 1)
  }
  return months
}

function buildMonthYearGroups(months: MonthInfo[]): Group[] {
  const res: Group[] = []; let cur='',cnt=0
  months.forEach(m => {
    const k = String(m.year)
    if (k!==cur) { if(cur) res.push({key:cur,label:`${cur}년`,count:cnt}); cur=k; cnt=1 } else cnt++
  })
  if (cur) res.push({key:cur,label:`${cur}년`,count:cnt})
  return res
}

function monthCellState(a: Activity, m: MonthInfo): CellState {
  const first=m.firstDay, last=m.lastDay
  const inMonth=(s:string|null)=>!!s&&parseISO(s)>=first&&parseISO(s)<=last
  const sd=a.start_date?parseISO(a.start_date):null
  const ed=a.end_date?parseISO(a.end_date):null
  return {
    inRange: sd&&ed ? !(ed<first)&&!(sd>last) : false,
    isStart:      inMonth(a.start_date),
    isEnd:        inMonth(a.end_date),
    isCompletion: inMonth(a.completion_date),
  }
}

// ── Draft row ─────────────────────────────────────────────────────────────────
interface DraftRow {
  _id:string; insertAfter?:number; tech_item_id:number|null; name:string
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
  const commitEdit = useCallback((a:Activity)=>{
    if(!editing||editing.id!==a.id) return
    const isDate = editing.field==='start_date'||editing.field==='end_date'||editing.field==='completion_date'
    if(isDate&&draft){
      const m=draft.match(/^(\d{4})-\d{2}-\d{2}$/)
      if(!m||isNaN(new Date(draft).getTime())){
        toast.error('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)'); setEditing(null); return
      }
      const yr=parseInt(m[1])
      if(yr<1999||yr>9999){
        toast.error('년도는 1999~9999 사이여야 합니다'); setEditing(null); return
      }
    }
    if(editing.field==='start_date'&&draft&&a.end_date&&draft>a.end_date){
      toast.error('시작일이 종료일보다 늦을 수 없습니다'); setEditing(null); return
    }
    if(editing.field==='end_date'&&draft&&a.start_date&&draft<a.start_date){
      toast.error('종료일이 시작일보다 빠를 수 없습니다'); setEditing(null); return
    }
    mut.mutate({id:a.id,patch:buildPatch(a,editing.field,draft)})
  },[editing,draft,mut])
  const saveField  = useCallback((a:Activity,f:string,v:string)=>{ mut.mutate({id:a.id,patch:buildPatch(a,f,v)}) },[mut])
  const cancelEdit = useCallback(()=>setEditing(null),[])
  return { editing, draft, setDraft, startEdit, commitEdit, saveField, cancelEdit }
}

// ── GanttChart ────────────────────────────────────────────────────────────────
export function GanttChart() {
  const { selectedProjectId, selectedTechItemId, sidebarOpen, toggleSidebar } = useApp()
  const qc = useQueryClient()
  const [actModal,  setActModal]  = useState<{open:boolean;activity?:Activity}>({open:false})
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])
  const [viewUnit,  setViewUnit]  = useState<'week'|'month'>('week')
  const [pasteAnchor, setPasteAnchor] = useState<{actId:number;colIdx:number}|null>(null)
  const savingRef    = useRef<Set<string>>(new Set())
  const fixedRef     = useRef<Set<number>>(new Set())
  const viewUnitRef  = useRef<'week'|'month'>('week')

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

  const { data: members = [] } = useQuery({
    queryKey: ['members', selectedProjectId],
    queryFn:  ()=>getMembers(selectedProjectId!),
    enabled:  !!selectedProjectId,
  })

  const todayStr = useMemo(()=>format(new Date(),'yyyy-MM-dd'),[])
  const isDelayed = useCallback((a: Activity)=>
    !!a.end_date && a.end_date < todayStr && a.status !== 'complete'
  ,[todayStr])

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

  useEffect(()=>{ viewUnitRef.current = viewUnit },[viewUnit])

  const weeks      = useMemo(()=>generateWeeks(sorted),[sorted])
  const yGroups    = useMemo(()=>buildYearGroups(weeks),[weeks])
  const mGroups    = useMemo(()=>buildMonthGroups(weeks),[weeks])
  const nowW       = useMemo(()=>({y:getISOWeekYear(new Date()),w:getISOWeek(new Date())}),[])
  const months     = useMemo(()=>viewUnit==='month'?generateMonths(sorted):[]  ,[sorted,viewUnit])
  const mYearGroups= useMemo(()=>buildMonthYearGroups(months),[months])
  const nowM       = useMemo(()=>({y:getYear(new Date()),m:getMonth(new Date())}),[])

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
      const unitW = viewUnitRef.current==='month' ? MONTH_W : WEEK_W
      const delta=Math.round((e.clientX-d.startX)/unitW)
      if(delta!==d.currentWeekDelta) {
        const nd={...d,currentWeekDelta:delta}; draggingRef.current=nd; setDraggingState(nd)
      }
    }
    const onUp=()=>{
      const d=draggingRef.current; if(!d) return
      draggingRef.current=null; setDraggingState(null)
      document.body.style.cursor=''; document.body.style.userSelect=''
      if(d.currentWeekDelta===0) return
      const a=activitiesRef.current.find(x=>x.id===d.activityId); if(!a) return
      const isMonth = viewUnitRef.current==='month'
      const shift=(dt:string|null)=>dt?format(
        isMonth?addMonths(parseISO(dt),d.currentWeekDelta):addWeeks(parseISO(dt),d.currentWeekDelta),
        'yyyy-MM-dd'):null
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
    const isMonth = viewUnit==='month'
    const shift=(dt:string|null)=>dt?format(
      isMonth?addMonths(parseISO(dt),d.currentWeekDelta):addWeeks(parseISO(dt),d.currentWeekDelta),
      'yyyy-MM-dd'):null
    if(d.type==='start') return {...a,start_date:shift(d.origStartDate)}
    if(d.type==='end')   return {...a,end_date:shift(d.origEndDate)}
    return {...a,start_date:shift(d.origStartDate),end_date:shift(d.origEndDate)}
  },[dragging,viewUnit])

  // ── Draft management ──────────────────────────────────────────
  const addDraftRow   = (tiId?:number,insertAfter?:number)=>setDraftRows(prev=>[...prev,{...emptyDraft(techItems,selectedTechItemId),tech_item_id:tiId??selectedTechItemId??techItems[0]?.id??null,insertAfter}])
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

  const downloadExcel = useCallback(async ()=>{
    const ExcelJS = (await import('exceljs')).default

    // ── 색상 상수 ──────────────────────────────────────────────────
    const C = {
      headerBg:   'F1F5F9', headerFg:   '334155',
      yearBg:     'E2E8F0', yearFg:     '1E293B',
      todayBg:    'BFDBFE', todayFg:    '1E3A5F',
      review:     { bg:'FEF3C7', fg:'92400E' },
      in_progress:{ bg:'DBEAFE', fg:'1E40AF' },
      complete:   { bg:'D1FAE5', fg:'065F46' },
      completion: { bg:'EDE9FE', fg:'5B21B6' },
      rowEven:    'FFFFFF', rowOdd: 'F8FAFC',
    }

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Project Manager'
    const ws = wb.addWorksheet('간트차트', { views:[{state:'frozen',xSplit:8,ySplit:viewUnit==='week'?3:2}] })

    const periods   = viewUnit==='week' ? weeks : months
    const headerRows = viewUnit==='week' ? 3 : 2
    const FIXED = 8  // 고정 컬럼 수

    // ── 열 너비 ────────────────────────────────────────────────────
    const colWidths = [
      COLS[0].w/7, COLS[1].w/7, COLS[2].w/7, COLS[3].w/7,
      COLS[4].w/7, COLS[5].w/7, COLS[6].w/7, COLS[7].w/7,
      ...periods.map(()=> viewUnit==='week' ? WEEK_W/7 : MONTH_W/7),
    ]
    ws.columns = colWidths.map(w=>({ width: Math.max(4, Math.round(w)) }))

    // ── 헬퍼 ───────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hStyle = (cell: any, bg: string=C.headerBg, fg: string=C.headerFg)=>{
      cell.fill   = { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+bg} }
      cell.font   = { bold:true, color:{argb:'FF'+fg}, size:9 }
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:false }
      cell.border = {
        top:{style:'thin',color:{argb:'FFCBD5E1'}}, bottom:{style:'thin',color:{argb:'FFCBD5E1'}},
        left:{style:'thin',color:{argb:'FFCBD5E1'}}, right:{style:'thin',color:{argb:'FFCBD5E1'}},
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fillCell = (cell: any, bg: string, fg: string)=>{
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+bg} }
      cell.font = { color:{argb:'FF'+fg}, size:9 }
      cell.alignment = { horizontal:'center', vertical:'middle' }
      cell.border = { top:{style:'hair',color:{argb:'FFE2E8F0'}}, bottom:{style:'hair',color:{argb:'FFE2E8F0'}},
                      left:{style:'hair',color:{argb:'FFE2E8F0'}}, right:{style:'hair',color:{argb:'FFE2E8F0'}} }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataStyle = (cell: any, rowBg: string)=>{
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+rowBg} }
      cell.font = { size:9 }
      cell.alignment = { horizontal:'left', vertical:'middle' }
      cell.border = { top:{style:'hair',color:{argb:'FFE2E8F0'}}, bottom:{style:'hair',color:{argb:'FFE2E8F0'}},
                      left:{style:'hair',color:{argb:'FFE2E8F0'}}, right:{style:'hair',color:{argb:'FFE2E8F0'}} }
    }

    // ── 오늘 판별 ──────────────────────────────────────────────────
    const isCurrentPeriod = (idx: number)=>{
      if(viewUnit==='week'){
        const w=weeks[idx]; return w.year===nowW.y && w.week===nowW.w
      } else {
        const m=months[idx]; return m.year===nowM.y && m.month===nowM.m
      }
    }

    // ── 행 1 : 년 그룹 (고정컬럼 병합 포함) ──────────────────────
    const row1 = ws.getRow(1); row1.height = 18
    for(let c=1; c<=FIXED; c++){
      const cell = row1.getCell(c)
      cell.value = COLS[c-1].label
      hStyle(cell)
    }
    // 년 그룹
    let colCursor = FIXED+1
    const yearGroups = viewUnit==='week' ? buildYearGroups(weeks) : buildMonthYearGroups(months)
    for(const g of yearGroups){
      const startC=colCursor, endC=colCursor+g.count-1
      const cell = row1.getCell(startC)
      cell.value = g.label
      hStyle(cell, C.yearBg, C.yearFg)
      if(endC>startC) ws.mergeCells(1,startC,1,endC)
      colCursor = endC+1
    }

    if(viewUnit==='week'){
      // 고정 컬럼: 행1~3 병합
      for(let c=1; c<=FIXED; c++) ws.mergeCells(1,c,3,c)

      // ── 행 2 : 월 그룹 ──────────────────────────────────────────
      const row2 = ws.getRow(2); row2.height = 16
      const mGroups = buildMonthGroups(weeks)
      let cur2 = FIXED+1
      for(const g of mGroups){
        const startC=cur2, endC=cur2+g.count-1
        const cell = row2.getCell(startC)
        cell.value = g.label
        hStyle(cell)
        if(endC>startC) ws.mergeCells(2,startC,2,endC)
        cur2 = endC+1
      }

      // ── 행 3 : 주차 ─────────────────────────────────────────────
      const row3 = ws.getRow(3); row3.height = 14
      weeks.forEach((w,i)=>{
        const cell = row3.getCell(FIXED+1+i)
        cell.value = `${w.week}주`
        const isCur = w.year===nowW.y && w.week===nowW.w
        hStyle(cell, isCur?C.todayBg:C.headerBg, isCur?C.todayFg:C.headerFg)
      })

    } else {
      // 고정 컬럼: 행1~2 병합
      for(let c=1; c<=FIXED; c++) ws.mergeCells(1,c,2,c)

      // ── 행 2 : 월 ───────────────────────────────────────────────
      const row2 = ws.getRow(2); row2.height = 16
      months.forEach((m,i)=>{
        const cell = row2.getCell(FIXED+1+i)
        cell.value = MONTHS_KO[m.month]
        const isCur = m.year===nowM.y && m.month===nowM.m
        hStyle(cell, isCur?C.todayBg:C.headerBg, isCur?C.todayFg:C.headerFg)
      })
    }

    // ── 데이터 행 ──────────────────────────────────────────────────
    const dataStartRow = headerRows+1
    sorted.forEach((a,ri)=>{
      const rowBg = ri%2===0 ? C.rowEven : C.rowOdd
      const dr = ws.getRow(dataStartRow+ri)
      dr.height = 16

      const fixedVals = [
        tiMap[a.tech_item_id]??'', a.name,
        a.start_date??'', a.end_date??'', a.completion_date??'',
        a.assignee??'', STATUS_LABEL[a.status]??a.status, a.notes??'',
      ]
      fixedVals.forEach((v,ci)=>{
        const cell = dr.getCell(ci+1)
        cell.value = v
        dataStyle(cell, rowBg)
        if(ci===6){
          // 상태 셀은 배경색으로 강조
          const sc = C[a.status as keyof typeof C] as {bg:string;fg:string}|undefined
          if(sc){ cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+sc.bg}}; cell.font={color:{argb:'FF'+sc.fg},size:9,bold:true}; cell.alignment={horizontal:'center',vertical:'middle'} }
        }
      })

      // 타임라인 셀
      periods.forEach((_,pi)=>{
        const cell = dr.getCell(FIXED+1+pi)
        // 완료일 판별
        const isComp = (()=>{
          if(!a.completion_date) return false
          if(viewUnit==='week'){
            const w=weeks[pi]
            const wMon=format(w.monday,'yyyy-MM-dd'), wSun=format(addDays(w.monday,6),'yyyy-MM-dd')
            return a.completion_date>=wMon && a.completion_date<=wSun
          } else {
            const m=months[pi]
            const mF=format(m.firstDay,'yyyy-MM-dd'), mL=format(m.lastDay,'yyyy-MM-dd')
            return a.completion_date>=mF && a.completion_date<=mL
          }
        })()
        // 범위 내 판별
        const inRange = (()=>{
          if(!a.start_date||!a.end_date) return false
          if(viewUnit==='week'){
            const w=weeks[pi]
            const wMon=format(w.monday,'yyyy-MM-dd'), wSun=format(addDays(w.monday,6),'yyyy-MM-dd')
            return a.start_date<=wSun && a.end_date>=wMon
          } else {
            const m=months[pi]
            const mF=format(m.firstDay,'yyyy-MM-dd'), mL=format(m.lastDay,'yyyy-MM-dd')
            return a.start_date<=mL && a.end_date>=mF
          }
        })()

        if(isComp){
          fillCell(cell, C.completion.bg, C.completion.fg)
          cell.value = '●'
        } else if(inRange){
          const sc = C[a.status as keyof typeof C] as {bg:string;fg:string}|undefined
          if(sc) fillCell(cell, sc.bg, sc.fg)
          cell.value = '■'
        } else {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+rowBg} }
          cell.border = { top:{style:'hair',color:{argb:'FFE2E8F0'}}, bottom:{style:'hair',color:{argb:'FFE2E8F0'}},
                          left:{style:'hair',color:{argb:'FFE2E8F0'}}, right:{style:'hair',color:{argb:'FFE2E8F0'}} }
        }
        if(isCurrentPeriod(pi) && !isComp && !inRange){
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFF0F9FF'} }
        }
      })
    })

    // ── 저장 ───────────────────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href=url; el.download='gantt.xlsx'; el.click(); URL.revokeObjectURL(url)
  },[sorted,tiMap,weeks,months,viewUnit,nowW,nowM])

  // ── Paste handler ─────────────────────────────────────────────
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text')
    if (!text) return
    const rows = text.split(/\r?\n/).map(r=>r.split('\t')).filter(r=>r.some(c=>c.trim()))
    if (!rows.length) return
    if (rows.length===1 && rows[0].length===1) return
    e.preventDefault(); e.stopPropagation()

    const FIELDS = ['tech_item_id','name','start_date','end_date','completion_date','assignee','status','notes'] as const
    type F = typeof FIELDS[number]

    const startColIdx = pasteAnchor?.colIdx ?? 0
    const tiColOffset = 0 - startColIdx // offset of tech_item_id within paste columns
    const hasTiCol = tiColOffset >= 0

    const tiCache = new Map<string, number>(techItems.map(t=>[t.name.toLowerCase(), t.id]))
    let newTiCount = 0

    // ── Step 1: Tech Item 전처리 (붙여넣기 등장 순서대로 생성 + 전체 재조정) ──
    if (hasTiCol) {
      const seenKeys = new Set<string>()
      const pastedTiNames: string[] = []
      for (const row of rows) {
        const raw = (row[tiColOffset] ?? '').trim()
        if (!raw) continue
        const key = raw.toLowerCase()
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        pastedTiNames.push(raw)
        if (!tiCache.has(key) && selectedProjectId) {
          try {
            const ti = await createTechItem({ project_id: selectedProjectId, name: raw, order: 9999 })
            tiCache.set(key, ti.id)
            newTiCount++
          } catch { /* skip */ }
        }
      }
      // 붙여넣기 순서대로 order 재조정: 붙여넣기 항목 → 나머지 기존 항목
      if (selectedProjectId && pastedTiNames.length > 0) {
        const pastedIds = pastedTiNames.map(n=>tiCache.get(n.toLowerCase())).filter((id): id is number => id !== undefined)
        const pastedSet = new Set(pastedIds)
        const otherIds = [...techItems].sort((a,b)=>a.order-b.order).map(t=>t.id).filter(id=>!pastedSet.has(id))
        const reorderList = [...pastedIds, ...otherIds].map((id, i) => ({ id, order: i }))
        try { await reorderTechItems(selectedProjectId, reorderList) } catch { /* ignore */ }
      }
    }

    const parseDate = (v:string): string|null => {
      if (!v.trim()) return null
      const s = v.trim()
      let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
      if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
      m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*$/)
      if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
      const d = new Date(s)
      if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd')
      return null
    }
    const parseStatus = (v:string) => {
      const map: Record<string,string> = { '검토':'review','진행':'in_progress','완료':'complete',review:'review',in_progress:'in_progress',complete:'complete' }
      return map[v.trim()] ?? 'review'
    }

    const startRowIdx = pasteAnchor ? Math.max(0, sorted.findIndex(a=>a.id===pasteAnchor.actId)) : 0
    let updated=0, created=0, failed=0

    for (let ri=0; ri<rows.length; ri++) {
      const cols = rows[ri]
      const targetIdx = startRowIdx + ri
      const values: Partial<Record<F, any>> = {}

      for (let ci=0; ci<cols.length; ci++) {
        const fi = startColIdx + ci
        if (fi >= FIELDS.length) break
        const field = FIELDS[fi]
        const raw = cols[ci].trim()
        if (field==='tech_item_id') {
          const id = tiCache.get(raw.toLowerCase()) ?? null
          if (id !== null) values.tech_item_id = id
        } else if (field==='start_date'||field==='end_date'||field==='completion_date') {
          values[field] = parseDate(raw)
        } else if (field==='status') {
          values.status = parseStatus(raw) // 빈값·잘못된값 → 'review'
        } else {
          values[field as 'name'|'assignee'|'notes'] = raw || undefined
        }
      }
      if (Object.keys(values).length===0) continue

      if (targetIdx < sorted.length) {
        const a = sorted[targetIdx]
        const patch = {
          tech_item_id: values.tech_item_id??a.tech_item_id, name: values.name??a.name,
          start_date:      'start_date'      in values ? values.start_date      : a.start_date,
          end_date:        'end_date'        in values ? values.end_date        : a.end_date,
          completion_date: 'completion_date' in values ? values.completion_date : a.completion_date,
          assignee: values.assignee??a.assignee, status: values.status??a.status,
          notes: values.notes??a.notes, order: a.order, version: a.version,
        }
        try { await updateActivity(a.id, patch); updated++ } catch { failed++ }
      } else {
        if (!values.name) continue
        const fallbackTi = sorted.length ? sorted[sorted.length-1].tech_item_id : techItems[0]?.id
        const tiId = values.tech_item_id ?? fallbackTi
        if (!tiId) continue
        try {
          await createActivity({ tech_item_id:tiId, name:values.name, order:0,
            start_date:values.start_date??null, end_date:values.end_date??null,
            completion_date:values.completion_date??null,
            assignee:values.assignee??'', status:values.status??'review', notes:values.notes??'' })
          created++
        } catch { failed++ }
      }
    }

    invalidate()
    if ((newTiCount > 0 || hasTiCol) && selectedProjectId)
      qc.invalidateQueries({ queryKey: ['tech_items', selectedProjectId] })
    const parts=[
      newTiCount&&`Tech Item ${newTiCount}개 생성`,
      updated&&`Activity ${updated}개 수정`,
      created&&`Activity ${created}개 생성`,
      failed&&`${failed}개 실패`,
    ].filter(Boolean)
    if (parts.length) toast[failed?'error':'success'](parts.join(', '))
  }, [pasteAnchor, sorted, techItems, selectedProjectId, invalidate, qc])

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
    const isMonth = viewUnit==='month'
    const shift=(dt:string|null)=>dt?format(
      isMonth?addMonths(parseISO(dt),dragging.currentWeekDelta):addWeeks(parseISO(dt),dragging.currentWeekDelta),
      'MM/dd'):null
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
        <button onClick={toggleSidebar} title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
          className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0
            text-slate-400 hover:text-slate-600 hover:bg-slate-100
            dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors">
          {sidebarOpen ? <PanelLeftClose size={15}/> : <PanelLeftOpen size={15}/>}
        </button>
        <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
          {sorted.length}개 Activity
          {draftRows.length>0&&(
            <span className="ml-1.5 px-1.5 py-0.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded text-[11px]">+{draftRows.length} 작성중</span>
          )}
        </span>
        <span className="text-[11px] text-slate-400 hidden md:block">· 바 드래그: 날짜 조정 &nbsp;· 행 클릭 후 Ctrl+V: 붙여넣기</span>
        <div className="ml-auto flex items-center gap-2">
          {/* 주/월 토글 */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-[12px]">
            <button onClick={()=>setViewUnit('week')}
              className={`px-2.5 py-1 transition-colors ${viewUnit==='week'
                ?'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold'
                :'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              주
            </button>
            <button onClick={()=>setViewUnit('month')}
              className={`px-2.5 py-1 border-l border-slate-200 dark:border-slate-600 transition-colors ${viewUnit==='month'
                ?'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold'
                :'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              월
            </button>
          </div>
          <button onClick={downloadExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
            <FileSpreadsheet size={13}/> Excel 다운로드
          </button>
          <button onClick={()=>setActModal({open:true})}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors">
            <Plus size={13}/> Activity 추가
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={`flex-1 overflow-auto mx-4 my-3 rounded-xl border border-slate-200 dark:border-slate-700 ${dragging?'select-none':''}`}
        onPaste={handlePaste}>
        {(() => {
          const colCount = viewUnit==='week' ? weeks.length : months.length
          const unitW    = viewUnit==='week' ? WEEK_W : MONTH_W
          const minW     = ACTION_W + COLS.reduce((s,c)=>s+c.w,0) + colCount*unitW
          const rowSpan  = viewUnit==='week' ? 3 : 2
          return (
        <table style={{tableLayout:'fixed',borderCollapse:'separate',borderSpacing:0,minWidth:minW,width:minW}}>
          <colgroup>
            <col style={{width:ACTION_W}}/>
            {COLS.map(c=><col key={c.key} style={{width:c.w}}/>)}
            {viewUnit==='week'
              ? weeks.map(w=><col key={`${w.year}-${w.week}`} style={{width:WEEK_W}}/>)
              : months.map(m=><col key={`${m.year}-${m.month}`} style={{width:MONTH_W}}/>)
            }
          </colgroup>

          <thead>
            <tr style={{height:26}}>
              <th rowSpan={rowSpan} className={`${thBase} sticky z-30`} style={{left:0,width:ACTION_W,top:TOP_YEAR}}>
                <button onClick={()=>addDraftRow()} title="행 추가"
                  className="w-7 h-7 flex items-center justify-center rounded-lg mx-auto
                    text-slate-400 hover:text-brand-600 hover:bg-brand-50
                    dark:hover:text-brand-400 dark:hover:bg-brand-900/30 transition-colors">
                  <Plus size={13}/>
                </button>
              </th>
              {COLS.map((c,i)=>(
                <th key={c.key} rowSpan={rowSpan} className={`${thBase} sticky z-30 px-2`}
                  style={{left:colLeft(i),width:c.w,top:TOP_YEAR}}>{c.label}</th>
              ))}
              {/* Year groups */}
              {viewUnit==='week'
                ? yGroups.map(yg=><th key={yg.key} colSpan={yg.count} className={`${thBase} sticky z-20 px-2`} style={{top:TOP_YEAR}}>{yg.label}</th>)
                : mYearGroups.map(yg=><th key={yg.key} colSpan={yg.count} className={`${thBase} sticky z-20 px-2`} style={{top:TOP_YEAR}}>{yg.label}</th>)
              }
            </tr>
            {/* Month row (week view) */}
            {viewUnit==='week' && (
              <tr style={{height:24}}>
                {mGroups.map(mg=>(
                  <th key={mg.key} colSpan={mg.count} className={`${thBase} sticky z-20 px-1`}
                    style={{top:TOP_MONTH}}>{mg.label}</th>
                ))}
              </tr>
            )}
            {/* Week row (week view) or Month row (month view) */}
            <tr style={{height:22}}>
              {viewUnit==='week'
                ? weeks.map(w=>{
                    const isCur=w.year===nowW.y&&w.week===nowW.w
                    return (
                      <th key={`${w.year}-${w.week}`} className={`${thBase} sticky z-20`}
                        style={{top:TOP_WEEK,width:WEEK_W,...(isCur?{background:'#93c5fd',color:'#1e3a8a',fontWeight:700}:{})}}
                        title={format(w.monday,'MM/dd')}>W{w.week}</th>
                    )
                  })
                : months.map(m=>{
                    const isCur=m.year===nowM.y&&m.month===nowM.m
                    return (
                      <th key={`${m.year}-${m.month}`} className={`${thBase} sticky z-20`}
                        style={{top:TOP_MONTH,width:MONTH_W,...(isCur?{background:'#93c5fd',color:'#1e3a8a',fontWeight:700}:{})}}
                        title={`${m.year}-${String(m.month+1).padStart(2,'0')}`}>
                        {MONTHS_KO[m.month]}
                      </th>
                    )
                  })
              }
            </tr>
          </thead>

          <tbody>
            {sorted.length===0&&draftRows.length===0&&(
              <tr><td colSpan={1+COLS.length+colCount}
                className="text-center py-16 text-slate-400 text-sm border-b border-slate-200 dark:border-slate-700">
                Activity가 없습니다.
              </td></tr>
            )}

            {sorted.flatMap((a,idx)=>{
              const isGroupStart = idx===0 || sorted[idx-1].tech_item_id !== a.tech_item_id
              const rowBg=idx%2===0?'':'bg-slate-50/60 dark:bg-slate-800/30'
              const stickyBg=idx%2===0?'bg-white dark:bg-slate-900':'bg-slate-50 dark:bg-slate-800'
              const completionMissing=a.status==='complete'&&!a.completion_date
              const isDraggingThis=dragging?.activityId===a.id
              const pa=previewAct(a) // preview dates during drag

              const groupHeader = isGroupStart ? (
                <tr key={`group-${a.tech_item_id}-${idx}`} style={{height:26}}>
                  <td colSpan={1+COLS.length}
                    className="sticky left-0 z-10 px-3 border-b border-t-2 border-t-slate-300 dark:border-t-slate-500 border-b-slate-200 dark:border-b-slate-700 bg-slate-100 dark:bg-slate-800/80 whitespace-nowrap"
                    style={{left:0}}>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {tiMap[a.tech_item_id]??'—'}
                    </span>
                  </td>
                  {(viewUnit==='week'?weeks:months).map((_,pi)=>(
                    <td key={pi} className="border-b border-t-2 border-t-slate-300 dark:border-t-slate-500 border-b-slate-200 dark:border-b-slate-700 bg-slate-100 dark:bg-slate-800/80"
                      style={{width:viewUnit==='week'?WEEK_W:MONTH_W}}/>
                  ))}
                </tr>
              ) : null

              const isAnchor = pasteAnchor?.actId===a.id
              const actRow = (
                <tr key={a.id}
                  onClick={(e)=>{
                    const td=(e.target as HTMLElement).closest('td') as HTMLTableCellElement|null
                    if(!td) return
                    const allTds=Array.from(td.parentElement?.querySelectorAll('td')??[])
                    const colIdx=Math.max(0, Math.min(allTds.indexOf(td)-1, COLS.length-1))
                    setPasteAnchor({actId:a.id, colIdx})
                  }}
                  className={`group ${rowBg} ${!dragging?'hover:bg-brand-50/40 dark:hover:bg-brand-900/10':''} transition-colors ${isAnchor?'outline outline-1 outline-offset-[-1px] outline-blue-400 dark:outline-blue-500':''}`}
                  style={{height:36}}>

                  {/* Action buttons */}
                  <td className={`border-b border-r border-slate-200 dark:border-slate-700 text-[11px] overflow-hidden h-9 sticky z-10 ${stickyBg}`}
                    style={{left:0,width:ACTION_W}}>
                    <div className="flex items-center justify-center gap-0.5 h-full px-1">
                      <ActionBtn title="행 추가 (같은 Tech Item)" onClick={()=>addDraftRow(a.tech_item_id,a.id)}
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
                    style={{left:colLeft(1),width:COLS[1].w}} sticky bgClass={stickyBg}
                    delayed={isDelayed(a)}/>
                  <EditDateCell field="start_date" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(2),width:COLS[2].w}} sticky bgClass={stickyBg}
                    maxDate={a.end_date??undefined}
                    previewValue={isDraggingThis&&dragging.type!=='end'?pa.start_date:undefined}/>
                  <EditDateCell field="end_date" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(3),width:COLS[3].w}} sticky bgClass={stickyBg}
                    minDate={a.start_date??undefined}
                    previewValue={isDraggingThis&&dragging.type!=='start'?pa.end_date:undefined}/>
                  <EditDateCell field="completion_date" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(4),width:COLS[4].w}} sticky warnEmpty={completionMissing} bgClass={stickyBg}/>
                  <EditAssigneeCell activity={a} members={members}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(5),width:COLS[5].w}} bgClass={stickyBg}/>
                  <EditStatusCell activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(6),width:COLS[6].w}} sticky bgClass={stickyBg}/>
                  <EditTextCell value={a.notes} field="notes" activity={a}
                    editing={editing} draft={draft} setDraft={setDraft}
                    startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                    style={{left:colLeft(7),width:COLS[7].w}} sticky bgClass={stickyBg}/>

                  {/* Timeline cells */}
                  {viewUnit==='week'
                    ? weeks.map(w=>{
                        const cs=cellState(pa,w)
                        const hasBar=cs.inRange||cs.isStart||cs.isEnd
                        const isCurWeek=w.year===nowW.y&&w.week===nowW.w
                        const [c1,c2]=BAR_GRAD[a.status]??BAR_GRAD.review
                        return (
                          <td key={`${w.year}-${w.week}`}
                            className={`border-b border-r border-slate-200 dark:border-slate-700 relative p-0 ${isCurWeek?'bg-blue-200/70 dark:bg-brand-900/10':''}`}
                            style={{width:WEEK_W,height:36}}>
                            {isCurWeek&&<div className="absolute inset-y-0 left-1/2 -translate-x-px w-[2px] bg-blue-500 opacity-70"/>}
                            {hasBar&&(
                              <div className={`absolute left-0 right-0 mx-px transition-opacity ${isDraggingThis?'opacity-60':''}`}
                                style={{top:'20%',bottom:'20%',
                                  borderRadius:cs.isStart&&cs.isEnd?4:cs.isStart?'4px 0 0 4px':cs.isEnd?'0 4px 4px 0':0,
                                  background:`linear-gradient(135deg,${c1},${c2})`,opacity:isDraggingThis?.6:.85,
                                  marginLeft:cs.isStart?2:0,marginRight:cs.isEnd?2:0}}>
                                {cs.isStart&&!cs.isCompletion&&(
                                  <div className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-20 group/hdl"
                                    onMouseDown={e=>handleDragStart(a,'start',e.clientX,e)}>
                                    <div className="absolute left-0.5 top-1/4 bottom-1/4 w-0.5 rounded-full bg-white/60 group-hover/hdl:bg-white transition-colors"/>
                                  </div>
                                )}
                                {cs.isEnd&&!cs.isCompletion&&(
                                  <div className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-20 group/hdl"
                                    onMouseDown={e=>handleDragStart(a,'end',e.clientX,e)}>
                                    <div className="absolute right-0.5 top-1/4 bottom-1/4 w-0.5 rounded-full bg-white/60 group-hover/hdl:bg-white transition-colors"/>
                                  </div>
                                )}
                                {!cs.isCompletion&&(
                                  <div className="absolute cursor-grab active:cursor-grabbing z-10"
                                    style={{left:cs.isStart?12:0,right:cs.isEnd?12:0,top:0,bottom:0}}
                                    onMouseDown={e=>handleDragStart(a,'move',e.clientX,e)}/>
                                )}
                              </div>
                            )}
                            {cs.isCompletion&&(
                              <div className="absolute inset-0 flex items-center justify-center">
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
                      })
                    : months.map(m=>{
                        const cs=monthCellState(pa,m)
                        const hasBar=cs.inRange||cs.isStart||cs.isEnd
                        const isCurMonth=m.year===nowM.y&&m.month===nowM.m
                        const [c1,c2]=BAR_GRAD[a.status]??BAR_GRAD.review
                        return (
                          <td key={`${m.year}-${m.month}`}
                            className={`border-b border-r border-slate-200 dark:border-slate-700 relative p-0 ${isCurMonth?'bg-blue-200/70 dark:bg-brand-900/10':''}`}
                            style={{width:MONTH_W,height:36}}>
                            {isCurMonth&&<div className="absolute inset-y-0 left-1/2 -translate-x-px w-[2px] bg-blue-500 opacity-70"/>}
                            {hasBar&&(
                              <div className={`absolute left-0 right-0 mx-px transition-opacity ${isDraggingThis?'opacity-60':''}`}
                                style={{top:'20%',bottom:'20%',
                                  borderRadius:cs.isStart&&cs.isEnd?4:cs.isStart?'4px 0 0 4px':cs.isEnd?'0 4px 4px 0':0,
                                  background:`linear-gradient(135deg,${c1},${c2})`,opacity:isDraggingThis?.6:.85,
                                  marginLeft:cs.isStart?2:0,marginRight:cs.isEnd?2:0}}>
                                {cs.isStart&&!cs.isCompletion&&(
                                  <div className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-20 group/hdl"
                                    onMouseDown={e=>handleDragStart(a,'start',e.clientX,e)}>
                                    <div className="absolute left-0.5 top-1/4 bottom-1/4 w-0.5 rounded-full bg-white/60 group-hover/hdl:bg-white transition-colors"/>
                                  </div>
                                )}
                                {cs.isEnd&&!cs.isCompletion&&(
                                  <div className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-20 group/hdl"
                                    onMouseDown={e=>handleDragStart(a,'end',e.clientX,e)}>
                                    <div className="absolute right-0.5 top-1/4 bottom-1/4 w-0.5 rounded-full bg-white/60 group-hover/hdl:bg-white transition-colors"/>
                                  </div>
                                )}
                                {!cs.isCompletion&&(
                                  <div className="absolute cursor-grab active:cursor-grabbing z-10"
                                    style={{left:cs.isStart?12:0,right:cs.isEnd?12:0,top:0,bottom:0}}
                                    onMouseDown={e=>handleDragStart(a,'move',e.clientX,e)}/>
                                )}
                              </div>
                            )}
                            {cs.isCompletion&&(
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center shadow-sm">
                                  <span className="text-white text-[8px] font-bold">✓</span>
                                </div>
                              </div>
                            )}
                          </td>
                        )
                      })
                  }
                </tr>
              )
              // draft rows inserted right after this activity
              const inlineDrafts = draftRows
                .filter(d=>d.insertAfter===a.id)
                .map((d,di)=>(
                  <DraftActivityRow key={d._id} draft={d} techItems={techItems} members={members}
                    weeks={weeks} months={months} viewUnit={viewUnit}
                    onUpdate={u=>updateDraft(d._id,u)} onSave={()=>saveDraft(d)} onCancel={()=>removeDraft(d._id)}
                    rowIndex={idx*10+di}/>
                ))

              return [groupHeader, actRow, ...inlineDrafts].filter(Boolean)
            })}

            {/* Draft rows appended at the end (head + button) */}
            {draftRows.filter(d=>d.insertAfter===undefined).map((d,di)=>(
              <DraftActivityRow key={d._id} draft={d} techItems={techItems} members={members}
                weeks={weeks} months={months} viewUnit={viewUnit}
                onUpdate={u=>updateDraft(d._id,u)} onSave={()=>saveDraft(d)} onCancel={()=>removeDraft(d._id)}
                rowIndex={sorted.length+di}/>
            ))}
          </tbody>
        </table>
          )
        })()}
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
function DraftActivityRow({draft,techItems,members,weeks,months,viewUnit,onUpdate,onSave,onCancel,rowIndex}:{
  draft:DraftRow;techItems:TechItem[];members:Member[];weeks:WeekInfo[];months:MonthInfo[];viewUnit:'week'|'month';
  onUpdate:(u:Partial<DraftRow>)=>void;onSave:()=>void;onCancel:()=>void;rowIndex:number;
}) {
  const rowBg=rowIndex%2===0?'':'bg-slate-50/60 dark:bg-slate-800/30'
  const stickyBg=rowIndex%2===0?'bg-white dark:bg-slate-900':'bg-slate-50 dark:bg-slate-800'
  const inp=`w-full h-full px-1.5 text-[11px] bg-transparent border-none outline-none focus:bg-brand-50/60 dark:focus:bg-brand-900/20 text-slate-700 dark:text-slate-300`
  const sel=`w-full h-full px-1.5 text-[11px] border-none outline-none cursor-pointer bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 [color-scheme:light] dark:[color-scheme:dark]`
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
        <select className={sel} value={draft.tech_item_id??''} onKeyDown={kd} onChange={e=>upd('tech_item_id',Number(e.target.value))}>
          <option value="">선택...</option>
          {techItems.map(ti=><option key={ti.id} value={ti.id}>{ti.name}</option>)}
        </select>
      </td>
      <td className={td} style={{left:colLeft(1),width:COLS[1].w}}>
        <input autoFocus className={inp} placeholder="Activity명..." value={draft.name} onKeyDown={kd} onChange={e=>upd('name',e.target.value)}/>
      </td>
      <td className={td} style={{left:colLeft(2),width:COLS[2].w}}>
        <input type="date" className={inp} value={draft.start_date} onKeyDown={kd}
          max={draft.end_date||undefined}
          onChange={e=>{ const v=e.target.value; upd('start_date',v); if(draft.end_date&&v>draft.end_date) onUpdate({end_date:v}) }}/>
      </td>
      <td className={td} style={{left:colLeft(3),width:COLS[3].w}}>
        <input type="date" className={inp} value={draft.end_date} onKeyDown={kd}
          min={draft.start_date||undefined}
          onChange={e=>{ const v=e.target.value; upd('end_date',v); if(draft.start_date&&v<draft.start_date) onUpdate({start_date:v}) }}/>
      </td>
      <td className={`${td} ${draft.status==='complete'&&!draft.completion_date?'ring-1 ring-inset ring-red-400':''}`} style={{left:colLeft(4),width:COLS[4].w}}>
        <input type="date" className={inp} value={draft.completion_date} onKeyDown={kd} onChange={e=>upd('completion_date',e.target.value)}/>
      </td>
      <td className={td} style={{left:colLeft(5),width:COLS[5].w}}>
        <select className={sel} value={draft.assignee} onKeyDown={kd} onChange={e=>upd('assignee',e.target.value)}>
          <option value="">미지정</option>
          {members.map(m=><option key={m.user_id} value={m.name}>{m.name}</option>)}
        </select>
      </td>
      <td className={td} style={{left:colLeft(6),width:COLS[6].w}}>
        <select className={sel} value={draft.status} onKeyDown={kd} onChange={e=>upd('status',e.target.value)}>
          <option value="review">검토</option>
          <option value="in_progress">진행</option>
          <option value="complete">완료</option>
        </select>
      </td>
      <td className={td} style={{left:colLeft(7),width:COLS[7].w}}>
        <input className={inp} placeholder="메모" value={draft.notes} onKeyDown={kd} onChange={e=>upd('notes',e.target.value)}/>
      </td>
      {viewUnit==='week'
        ? weeks.map(w=>(
            <td key={`${w.year}-${w.week}`} className="border-b border-r border-brand-100 dark:border-brand-900/30" style={{width:WEEK_W}}/>
          ))
        : months.map(m=>(
            <td key={`${m.year}-${m.month}`} className="border-b border-r border-brand-100 dark:border-brand-900/30" style={{width:MONTH_W}}/>
          ))
      }
    </tr>
  )
}

// ── Editable cell components ──────────────────────────────────────────────────
const sTd='border-b border-r border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 overflow-hidden h-9 sticky z-10'

interface ECBase { activity:Activity; field:string; editing:{id:number;field:string}|null; draft:string; setDraft:(v:string)=>void; startEdit:(a:Activity,f:string)=>void; commitEdit:(a:Activity)=>void; cancelEdit:()=>void; style:React.CSSProperties; sticky?:boolean; warnEmpty?:boolean; previewValue?: string|null; bgClass?:string; delayed?:boolean }

function EditTextCell({value,activity,field,editing,draft,setDraft,startEdit,commitEdit,cancelEdit,style,warnEmpty,bgClass,delayed}:ECBase&{value:string}) {
  const isE=editing?.id===activity.id&&editing.field===field
  return (
    <td className={`${sTd} cursor-text ${warnEmpty?'ring-1 ring-inset ring-red-400':''} ${bgClass??'bg-white dark:bg-slate-900'}`} style={style} onClick={()=>!isE&&startEdit(activity,field)}>
      {isE ? <input autoFocus className="gcell-input" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>commitEdit(activity)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(activity);if(e.key==='Escape')cancelEdit()}}/>
           : <span className={`flex items-center gap-1 truncate px-2 leading-9 ${delayed?'text-red-500 dark:text-red-400 font-medium':''}`}>
               {delayed&&<AlertTriangle size={11} className="flex-shrink-0 text-red-500 dark:text-red-400"/>}
               {value||<span className="text-slate-300 dark:text-slate-600">—</span>}
             </span>}
    </td>
  )
}

function EditDateCell({activity,field,editing,draft,setDraft,startEdit,commitEdit,cancelEdit,style,warnEmpty,previewValue,bgClass,minDate,maxDate}:ECBase&{minDate?:string;maxDate?:string}) {
  const isE=editing?.id===activity.id&&editing.field===field
  const val=(activity as any)[field] as string|null
  const showVal = previewValue !== undefined ? previewValue : val
  const display=showVal?format(parseISO(showVal),'yy-MM-dd'):''
  const isPreview = previewValue !== undefined && previewValue !== val
  return (
    <td className={`${sTd} cursor-text text-center ${warnEmpty?'ring-1 ring-inset ring-red-400':''} ${isPreview?'text-brand-600 dark:text-brand-400 font-semibold':''} ${bgClass??'bg-white dark:bg-slate-900'}`}
      style={style} onClick={()=>!isE&&startEdit(activity,field)}>
      {isE ? <input type="date" autoFocus className="gcell-input text-center" value={draft} min={minDate} max={maxDate} onChange={e=>setDraft(e.target.value)} onBlur={()=>commitEdit(activity)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(activity);if(e.key==='Escape')cancelEdit()}}/>
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

function EditAssigneeCell({activity,members,editing,draft,setDraft,startEdit,commitEdit,cancelEdit,style,bgClass}:Omit<ECBase,'field'>&{members:Member[]}) {
  const field='assignee'; const isE=editing?.id===activity.id&&editing.field===field
  const val=activity.assignee??''
  return (
    <td className={`${sTd} cursor-pointer ${bgClass??'bg-white dark:bg-slate-900'}`} style={style} onClick={()=>!isE&&startEdit(activity,field)}>
      {isE ? <select autoFocus className="gcell-input cursor-pointer" value={draft}
                onChange={e=>setDraft(e.target.value)}
                onBlur={()=>commitEdit(activity)} onKeyDown={e=>{if(e.key==='Enter')commitEdit(activity);if(e.key==='Escape')cancelEdit()}}>
               <option value="">미지정</option>
               {members.map(m=><option key={m.user_id} value={m.name}>{m.name}</option>)}
               {val&&!members.some(m=>m.name===val)&&<option value={val}>{val}</option>}
             </select>
           : <span className="block truncate px-2 leading-9">{val||<span className="text-slate-300 dark:text-slate-600">—</span>}</span>}
    </td>
  )
}
