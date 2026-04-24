export interface User {
  id: number
  name: string
  knox_id: string
  is_admin: boolean
  created_at: string
}

export interface Project {
  id: number
  name: string
  description: string
  version: number
  created_by: number | null
  user_role: 'master' | 'member' | null
  created_at: string
  updated_at: string
}

export interface TechItem {
  id: number
  project_id: number
  name: string
  description: string
  order: number
  version: number
  created_at: string
  updated_at: string
}

export type ActivityStatus = 'review' | 'in_progress' | 'complete'

export interface Activity {
  id: number
  tech_item_id: number
  name: string
  start_date: string | null
  end_date: string | null
  completion_date: string | null
  assignee: string
  status: ActivityStatus
  notes: string
  order: number
  version: number
  created_at: string
  updated_at: string
}

export interface Member {
  id: number
  user_id: number
  name: string
  knox_id: string
  role: 'master' | 'member'
  created_at: string
}

export interface Backup {
  id: number
  project_id: number
  name: string
  created_by_name: string | null
  created_at: string
}

export type ViewMode = 'gantt' | 'kanban'

export interface AdminProjectStat {
  id: number
  name: string
  member_count: number
  total: number
  review: number
  in_progress: number
  complete: number
  rate: number
  created_at: string | null
}

export interface AdminAlertActivity {
  id: number
  name: string
  end_date: string
  status: string
  assignee: string
  project_name: string
}

export interface AdminUserStat {
  user_id: number
  name: string
  knox_id: string
  is_admin: boolean
  project_count: number
  assigned_count: number
}

export interface AdminStats {
  total_users: number
  total_projects: number
  total_activities: number
  global_status: { review: number; in_progress: number; complete: number }
  project_stats: AdminProjectStat[]
  overdue: AdminAlertActivity[]
  due_soon: AdminAlertActivity[]
  user_stats: AdminUserStat[]
}
