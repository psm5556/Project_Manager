import { useQuery } from '@tanstack/react-query'
import { Users, FolderOpen, ListChecks, TrendingUp, AlertTriangle, Clock, Crown } from 'lucide-react'
import { getAdminStats } from '../api'
import type { AdminProjectStat, AdminAlertActivity, AdminUserStat } from '../types'

export function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getAdminStats,
    refetchInterval: 30_000,
  })

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <p className="text-sm text-slate-400 animate-pulse">로딩 중...</p>
      </div>
    )
  }

  const totalComplete = data.global_status.complete
  const totalAll = data.total_activities
  const globalRate = totalAll > 0 ? Math.round(totalComplete / totalAll * 100) : 0

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* ① 시스템 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={18} className="text-brand-500"/>}
          label="전체 사용자" value={data.total_users} unit="명"
          bg="bg-brand-50 dark:bg-brand-900/20"/>
        <StatCard icon={<FolderOpen size={18} className="text-emerald-500"/>}
          label="전체 프로젝트" value={data.total_projects} unit="개"
          bg="bg-emerald-50 dark:bg-emerald-900/20"/>
        <StatCard icon={<ListChecks size={18} className="text-blue-500"/>}
          label="전체 Activity" value={data.total_activities} unit="개"
          bg="bg-blue-50 dark:bg-blue-900/20"/>
        <StatCard icon={<TrendingUp size={18} className="text-violet-500"/>}
          label="전체 달성률" value={globalRate} unit="%"
          bg="bg-violet-50 dark:bg-violet-900/20"/>
      </div>

      {/* 전체 상태 분포 바 */}
      {totalAll > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800/30">
          <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 mb-2">전체 Activity 상태 분포</p>
          <div className="flex rounded-full overflow-hidden h-3 gap-px">
            {data.global_status.review > 0 && (
              <div className="bg-amber-400" style={{flex: data.global_status.review}} title={`검토 ${data.global_status.review}`}/>
            )}
            {data.global_status.in_progress > 0 && (
              <div className="bg-blue-400" style={{flex: data.global_status.in_progress}} title={`진행 ${data.global_status.in_progress}`}/>
            )}
            {data.global_status.complete > 0 && (
              <div className="bg-emerald-400" style={{flex: data.global_status.complete}} title={`완료 ${data.global_status.complete}`}/>
            )}
          </div>
          <div className="flex gap-4 mt-2">
            <LegendDot color="bg-amber-400" label={`검토 ${data.global_status.review}`}/>
            <LegendDot color="bg-blue-400" label={`진행 ${data.global_status.in_progress}`}/>
            <LegendDot color="bg-emerald-400" label={`완료 ${data.global_status.complete}`}/>
          </div>
        </div>
      )}

      {/* ② 프로젝트별 진행률 */}
      <Section title="프로젝트별 진행률" icon={<FolderOpen size={14}/>}>
        {data.project_stats.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">프로젝트가 없습니다</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700">
                  {['프로젝트명','멤버','검토','진행','완료','달성률'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.project_stats.map(p=>(
                  <ProjectRow key={p.id} p={p}/>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ③ 지연·마감임박 + ④ 사용자 현황 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ③ 지연·마감임박 */}
        <Section title="지연 · 마감임박" icon={<AlertTriangle size={14} className="text-red-500"/>}>
          {data.overdue.length === 0 && data.due_soon.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">해당 항목 없음</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {data.overdue.map(a=>(
                <AlertRow key={`ov-${a.id}`} a={a} variant="overdue"/>
              ))}
              {data.due_soon.map(a=>(
                <AlertRow key={`ds-${a.id}`} a={a} variant="due_soon"/>
              ))}
            </div>
          )}
        </Section>

        {/* ④ 사용자 현황 */}
        <Section title="사용자 현황" icon={<Users size={14}/>}>
          {data.user_stats.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">사용자가 없습니다</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {data.user_stats.map(u=>(
                <UserRow key={u.user_id} u={u}/>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, unit, bg }: {
  icon: React.ReactNode; label: string; value: number; unit: string; bg: string
}) {
  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-700 p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">{icon}
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        {value}<span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>
      </p>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`}/>
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/30 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function ProjectRow({ p }: { p: AdminProjectStat }) {
  return (
    <tr className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
      <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 truncate max-w-[140px]">{p.name}</td>
      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-center">{p.member_count}</td>
      <td className="px-3 py-2 text-center">
        <span className="px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">{p.review}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className="px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{p.in_progress}</span>
      </td>
      <td className="px-3 py-2 text-center">
        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">{p.complete}</span>
      </td>
      <td className="px-3 py-2 min-w-[100px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{width: `${p.rate}%`}}/>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 w-8 text-right">{p.rate}%</span>
        </div>
      </td>
    </tr>
  )
}

function AlertRow({ a, variant }: { a: AdminAlertActivity; variant: 'overdue' | 'due_soon' }) {
  const isOverdue = variant === 'overdue'
  const statusLabel = a.status === 'review' ? '검토' : a.status === 'in_progress' ? '진행' : '완료'
  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded-lg ${
      isOverdue ? 'bg-red-50 dark:bg-red-900/10' : 'bg-amber-50 dark:bg-amber-900/10'
    }`}>
      <Clock size={11} className={`flex-shrink-0 mt-0.5 ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}/>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate">{a.name}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{a.project_name}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className={`text-[10px] font-semibold ${isOverdue ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {a.end_date}
        </span>
        <span className="text-[10px] text-slate-400">{a.assignee || '미지정'} · {statusLabel}</span>
      </div>
    </div>
  )
}

function UserRow({ u }: { u: AdminUserStat }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
        u.is_admin ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                   : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
      }`}>
        {u.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-medium text-slate-700 dark:text-slate-200 truncate">{u.name}</span>
          {u.is_admin && <Crown size={10} className="text-amber-500 flex-shrink-0"/>}
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">{u.knox_id}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
        <span title="참여 프로젝트">
          <FolderOpen size={10} className="inline mr-0.5"/>{u.project_count}
        </span>
        <span title="담당 Activity">
          <ListChecks size={10} className="inline mr-0.5"/>{u.assigned_count}
        </span>
      </div>
    </div>
  )
}
