import axios from 'axios'
import type { Project, TechItem, Activity, User, Member, Backup } from '../types'

const api = axios.create({ baseURL: '/api' })

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('pm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pm_token')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const registerUser = (data: { name: string; knox_id: string; pin: string }) =>
  api.post<{ token: string; user: User }>('/auth/register', data).then(r => r.data)

export const loginUser = (data: { knox_id: string; pin: string }) =>
  api.post<{ token: string; user: User }>('/auth/login', data).then(r => r.data)

export const getMe = () =>
  api.get<User>('/auth/me').then(r => r.data)

// ─── Users ────────────────────────────────────────────────────────────────────

export const searchUsers = (q: string) =>
  api.get<User[]>('/users/search', { params: { q } }).then(r => r.data)

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminListUsers = () =>
  api.get<User[]>('/admin/users').then(r => r.data)

export const adminUpdateUser = (id: number, data: { name?: string; is_admin?: boolean }) =>
  api.patch<User>(`/admin/users/${id}`, data).then(r => r.data)

export const adminResetPin = (id: number, new_pin: string) =>
  api.post<User>(`/admin/users/${id}/reset-pin`, { new_pin }).then(r => r.data)

export const adminDeleteUser = (id: number) =>
  api.delete(`/admin/users/${id}`)

// ─── Projects ─────────────────────────────────────────────────────────────────

export const getProjects = () => api.get<Project[]>('/projects').then(r => r.data)
export const createProject = (data: { name: string; description?: string }) =>
  api.post<Project>('/projects', data).then(r => r.data)
export const updateProject = (id: number, data: { name: string; description?: string; version: number }) =>
  api.put<Project>(`/projects/${id}`, data).then(r => r.data)
export const deleteProject = (id: number) => api.delete(`/projects/${id}`)

// ─── Project Members ──────────────────────────────────────────────────────────

export const getMembers = (projectId: number) =>
  api.get<Member[]>(`/projects/${projectId}/members`).then(r => r.data)

export const addMember = (projectId: number, data: { knox_id: string; role?: string }) =>
  api.post<Member>(`/projects/${projectId}/members`, data).then(r => r.data)

export const updateMemberRole = (projectId: number, userId: number, role: string) =>
  api.patch<Member>(`/projects/${projectId}/members/${userId}`, { role }).then(r => r.data)

export const removeMember = (projectId: number, userId: number) =>
  api.delete(`/projects/${projectId}/members/${userId}`)

// ─── Backups ──────────────────────────────────────────────────────────────────

export const getBackups = (projectId: number) =>
  api.get<Backup[]>(`/projects/${projectId}/backups`).then(r => r.data)

export const createBackup = (projectId: number) =>
  api.post<Backup>(`/projects/${projectId}/backup`).then(r => r.data)

export const restoreBackup = (projectId: number, backupId: number) =>
  api.post(`/projects/${projectId}/restore/${backupId}`)

export const deleteBackup = (projectId: number, backupId: number) =>
  api.delete(`/projects/${projectId}/backups/${backupId}`)

// ─── Tech Items ───────────────────────────────────────────────────────────────

export const getTechItems = (projectId: number) =>
  api.get<TechItem[]>(`/projects/${projectId}/tech_items`).then(r => r.data)
export const createTechItem = (data: { project_id: number; name: string; description?: string }) =>
  api.post<TechItem>('/tech_items', data).then(r => r.data)
export const updateTechItem = (id: number, data: { name: string; description?: string; version: number }) =>
  api.put<TechItem>(`/tech_items/${id}`, data).then(r => r.data)
export const deleteTechItem = (id: number) => api.delete(`/tech_items/${id}`)

// ─── Activities ───────────────────────────────────────────────────────────────

export const getProjectActivities = (projectId: number) =>
  api.get<Activity[]>(`/projects/${projectId}/activities`).then(r => r.data)
export const getTechItemActivities = (techItemId: number) =>
  api.get<Activity[]>(`/tech_items/${techItemId}/activities`).then(r => r.data)
export const createActivity = (data: Omit<Activity, 'id' | 'version' | 'created_at' | 'updated_at'>) =>
  api.post<Activity>('/activities', data).then(r => r.data)
export const updateActivity = (id: number, data: Partial<Activity> & { version: number; tech_item_id: number }) =>
  api.put<Activity>(`/activities/${id}`, data).then(r => r.data)
export const deleteActivity = (id: number) => api.delete(`/activities/${id}`)
