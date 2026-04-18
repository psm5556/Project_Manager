import axios from 'axios'
import type { Project, TechItem, Activity } from '../types'

const api = axios.create({ baseURL: '/api' })

// Projects
export const getProjects = () => api.get<Project[]>('/projects').then(r => r.data)
export const createProject = (data: { name: string; description?: string }) =>
  api.post<Project>('/projects', data).then(r => r.data)
export const updateProject = (id: number, data: { name: string; description?: string; version: number }) =>
  api.put<Project>(`/projects/${id}`, data).then(r => r.data)
export const deleteProject = (id: number) => api.delete(`/projects/${id}`)

// Tech Items
export const getTechItems = (projectId: number) =>
  api.get<TechItem[]>(`/projects/${projectId}/tech_items`).then(r => r.data)
export const createTechItem = (data: { project_id: number; name: string; description?: string }) =>
  api.post<TechItem>('/tech_items', data).then(r => r.data)
export const updateTechItem = (id: number, data: { name: string; description?: string; version: number }) =>
  api.put<TechItem>(`/tech_items/${id}`, data).then(r => r.data)
export const deleteTechItem = (id: number) => api.delete(`/tech_items/${id}`)

// Activities
export const getProjectActivities = (projectId: number) =>
  api.get<Activity[]>(`/projects/${projectId}/activities`).then(r => r.data)
export const getTechItemActivities = (techItemId: number) =>
  api.get<Activity[]>(`/tech_items/${techItemId}/activities`).then(r => r.data)
export const createActivity = (data: Omit<Activity, 'id' | 'version' | 'created_at' | 'updated_at'>) =>
  api.post<Activity>('/activities', data).then(r => r.data)
export const updateActivity = (id: number, data: Partial<Activity> & { version: number; tech_item_id: number }) =>
  api.put<Activity>(`/activities/${id}`, data).then(r => r.data)
export const deleteActivity = (id: number) => api.delete(`/activities/${id}`)
