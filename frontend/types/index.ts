export type StemMode = '2stems' | '4stems'

export type AppStep = 'upload' | 'processing' | 'studio'

export interface StemInfo {
  name: string
  label: string
  url: string
}

export interface SeparationResult {
  job_id: string
  stem_mode: StemMode
  original_filename: string
  duration: number | null
  bpm: number | null
  stems: StemInfo[]
  created_at: string
  expires_at: string
}

export interface TrackState {
  volume: number // 0 – 1
  pan: number // -1 (full left) to 1 (full right)
  muted: boolean
  solo: boolean
}
