export interface TurfCreate {
  name: string
  description?: string
  boundary: Record<string, unknown>
}

export interface TurfUpdate {
  name?: string
  description?: string
  status?: string
  boundary?: Record<string, unknown>
}

export interface TurfResponse {
  id: string
  name: string
  description: string | null
  status: string
  boundary: Record<string, unknown>
  voter_count: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface VoterLocation {
  id: string
  latitude: number | null
  longitude: number | null
  name: string
}

export interface OverlappingTurf {
  id: string
  name: string
  boundary: Record<string, unknown>
}
