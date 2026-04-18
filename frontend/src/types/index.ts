export interface Project {
  id: number
  name: string
  description: string
  version: number
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

export type ViewMode = 'gantt' | 'kanban'
