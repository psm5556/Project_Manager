import { useState } from 'react'
import { Sun, Moon, LogOut, User, Crown, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../contexts/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { getProjectActivities } from '../api'
import { ProfileModal } from './modals/ProfileModal'

interface NavbarProps {
  onOpenAdmin?: () => void
}

export function Navbar({ onOpenAdmin }: NavbarProps) {
  const { selectedProjectId, viewMode, setViewMode, darkMode, toggleDarkMode } = useApp()
  const { user, logout } = useAuth()
  const [showProfile, setShowProfile] = useState(false)

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', 'project', selectedProjectId],
    queryFn: () => getProjectActivities(selectedProjectId!),
    enabled: !!selectedProjectId,
  })

  const total      = activities.length
  const review     = activities.filter(a => a.status === 'review').length
  const inProgress = activities.filter(a => a.status === 'in_progress').length
  const complete   = activities.filter(a => a.status === 'complete').length
  const rate       = total > 0 ? Math.round((complete / total) * 100) : 0

  return (
    <>
      <header className="h-[52px] flex-shrink-0 flex items-center px-5 gap-4
        bg-white dark:bg-slate-900
        border-b border-slate-200 dark:border-slate-800
        shadow-[0_1px_0_0_rgb(0_0_0/0.06)]">

        {/* ── Left: brand ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">PM</span>
          </div>
          <span className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap">
            Project Manager
          </span>
        </div>

        {/* ── Center: view toggle ──────────────────────────────── */}
        <div className="flex-1 flex justify-center">
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800
            rounded-lg p-0.5 gap-0.5">
            {(['gantt', 'kanban'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-5 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
                  viewMode === mode
                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-card font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {mode === 'gantt' ? '간트차트' : '칸반보드'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: stats + user + dark mode ─────────────────── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {selectedProjectId && (
            <div className="flex items-center gap-3">
              <StatBadge label="전체" value={total} color="text-slate-700 dark:text-slate-300" bg="bg-slate-100 dark:bg-slate-800" />
              <StatBadge label="검토" value={review} color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/30" />
              <StatBadge label="진행" value={inProgress} color="text-blue-700 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/30" />
              <StatBadge label="완료" value={complete} color="text-emerald-700 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-900/30" />
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">달성률</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all duration-500"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="text-[12px] font-bold text-slate-700 dark:text-slate-300">{rate}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Admin button */}
          {user?.is_admin && (
            <button
              onClick={onOpenAdmin}
              title="전체 관리자"
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[12px] font-medium
                bg-amber-50 hover:bg-amber-100 text-amber-700
                dark:bg-amber-900/20 dark:hover:bg-amber-900/40 dark:text-amber-400
                border border-amber-200 dark:border-amber-800 transition-colors"
            >
              <Crown size={13} />
              관리자
            </button>
          )}

          {/* User info + profile */}
          {user && (
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-700">
              <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                <User size={14} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div className="hidden md:flex flex-col leading-none">
                <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">{user.name}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{user.knox_id}</span>
              </div>
              <button
                onClick={() => setShowProfile(true)}
                title="프로필 설정"
                className="w-7 h-7 flex items-center justify-center rounded-lg
                  text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20
                  transition-colors"
              >
                <Settings size={14} />
              </button>
              <button
                onClick={logout}
                title="로그아웃"
                className="w-7 h-7 flex items-center justify-center rounded-lg
                  text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                  transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}

          <button
            onClick={toggleDarkMode}
            title={darkMode ? '라이트 모드' : '다크 모드'}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200
              hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}

function StatBadge({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-md ${bg}`}>
      <span className={`text-[11px] font-medium ${color} opacity-70`}>{label}</span>
      <span className={`text-[13px] font-bold ${color}`}>{value}</span>
    </div>
  )
}
