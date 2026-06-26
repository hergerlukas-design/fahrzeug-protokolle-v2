import { supabase, requireOnline } from './supabase'

export interface Project {
  id: string
  name: string
  description: string | null
  color: string | null
  is_archived: boolean
  archived_at: string | null
  created_at: string
}

export type ProjectWithCount = Project & { vehicle_count: number }

export const PROJECT_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
]

const VEHICLE_SELECT =
  'id, license_plate, license_plate_normalized, brand_model, vin, known_damages, cleanliness_interior, cleanliness_exterior, is_fueled, is_charged, availability, current_odometer, protocols(id, created_at, status, protocol_type, inspector_name)'

async function buildCountMap(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('vehicle_projects').select('project_id')
  if (error) throw error
  const map: Record<string, number> = {}
  for (const r of data ?? []) {
    map[r.project_id] = (map[r.project_id] ?? 0) + 1
  }
  return map
}

export async function fetchProjectsWithCounts(): Promise<ProjectWithCount[]> {
  const [{ data: projects, error: pErr }, countMap] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, description, color, is_archived, archived_at, created_at')
      .eq('is_archived', false)
      .order('name'),
    buildCountMap(),
  ])
  if (pErr) throw pErr
  return (projects ?? []).map((p) => ({ ...p, vehicle_count: countMap[p.id] ?? 0 })) as ProjectWithCount[]
}

export async function fetchArchivedProjectsWithCounts(): Promise<ProjectWithCount[]> {
  const [{ data: projects, error: pErr }, countMap] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, description, color, is_archived, archived_at, created_at')
      .eq('is_archived', true)
      .order('name'),
    buildCountMap(),
  ])
  if (pErr) throw pErr
  return (projects ?? []).map((p) => ({ ...p, vehicle_count: countMap[p.id] ?? 0 })) as ProjectWithCount[]
}

export async function fetchAllProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, color, is_archived, archived_at, created_at')
    .order('name')
  if (error) throw error
  return (data ?? []) as Project[]
}

export async function createProject(values: {
  name: string
  description?: string
  color?: string
}): Promise<Project> {
  requireOnline()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: values.name.trim(),
      description: values.description?.trim() || null,
      color: values.color || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Project
}

export async function updateProject(
  id: string,
  values: { name: string; description?: string; color?: string }
): Promise<Project> {
  requireOnline()
  const { data, error } = await supabase
    .from('projects')
    .update({
      name: values.name.trim(),
      description: values.description?.trim() || null,
      color: values.color || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Project
}

export async function archiveProject(id: string): Promise<void> {
  requireOnline()
  const { error } = await supabase
    .from('projects')
    .update({ is_archived: true, archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function unarchiveProject(id: string): Promise<void> {
  requireOnline()
  const { error } = await supabase
    .from('projects')
    .update({ is_archived: false, archived_at: null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteProject(id: string): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

export async function getProjectStats(
  projectId: string
): Promise<{ vehicleCount: number; protocolCount: number }> {
  const { data: vp, error: vpErr } = await supabase
    .from('vehicle_projects')
    .select('vehicle_id')
    .eq('project_id', projectId)
  if (vpErr) throw vpErr

  const vehicleIds = (vp ?? []).map((r: { vehicle_id: string }) => r.vehicle_id)
  if (vehicleIds.length === 0) return { vehicleCount: 0, protocolCount: 0 }

  const { count, error: protoErr } = await supabase
    .from('protocols')
    .select('id', { count: 'exact', head: true })
    .in('vehicle_id', vehicleIds)
  if (protoErr) throw protoErr

  return { vehicleCount: vehicleIds.length, protocolCount: count ?? 0 }
}

export async function checkProjectNameSimilar(name: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, color, is_archived, archived_at, created_at')
    .ilike('name', `%${name.trim()}%`)
  if (error) throw error
  return (data ?? []) as Project[]
}

export async function fetchVehicleProjects(vehicleId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('vehicle_projects')
    .select('projects(id, name, description, color, is_archived, archived_at, created_at)')
    .eq('vehicle_id', vehicleId)
  if (error) throw error
  return (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => r.projects as Project | Project[] | null)
    .map((p) => (Array.isArray(p) ? p[0] ?? null : p))
    .filter((p): p is Project => p !== null)
}

export async function addVehicleToProject(vehicleId: string, projectId: string): Promise<void> {
  requireOnline()
  const { error } = await supabase
    .from('vehicle_projects')
    .insert({ vehicle_id: vehicleId, project_id: projectId })
  if (error) throw error
}

export async function removeVehicleFromProject(vehicleId: string, projectId: string): Promise<void> {
  requireOnline()
  const { error } = await supabase
    .from('vehicle_projects')
    .delete()
    .eq('vehicle_id', vehicleId)
    .eq('project_id', projectId)
  if (error) throw error
}

export async function fetchVehiclesForProject(projectId: string) {
  const { data: vp, error: vpErr } = await supabase
    .from('vehicle_projects')
    .select('vehicle_id')
    .eq('project_id', projectId)
  if (vpErr) throw vpErr

  const vehicleIds = (vp ?? []).map((r: { vehicle_id: string }) => r.vehicle_id)
  if (vehicleIds.length === 0) return []

  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .in('id', vehicleIds)
    .order('license_plate')
  if (error) throw error
  return data ?? []
}

export async function fetchVehiclesWithoutProject() {
  const { data: vp, error: vpErr } = await supabase
    .from('vehicle_projects')
    .select('vehicle_id')
  if (vpErr) throw vpErr

  const assignedIds = new Set((vp ?? []).map((r: { vehicle_id: string }) => r.vehicle_id))

  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_SELECT)
    .order('license_plate')
  if (error) throw error

  return ((data ?? []) as { id: string }[]).filter((v) => !assignedIds.has(v.id))
}

export async function countVehiclesWithoutProject(): Promise<number> {
  const { data: vp, error: vpErr } = await supabase
    .from('vehicle_projects')
    .select('vehicle_id')
  if (vpErr) throw vpErr

  const assignedIds = new Set((vp ?? []).map((r: { vehicle_id: string }) => r.vehicle_id))

  const { data, error } = await supabase.from('vehicles').select('id')
  if (error) throw error

  return ((data ?? []) as { id: string }[]).filter((v) => !assignedIds.has(v.id)).length
}
