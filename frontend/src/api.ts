export type ModelStatus = {
  backend: string
  model: string
  model_loaded: boolean
  device: string
  error: string | null
  checkpoint_sha256: string | null
}

export type Detection = {
  id?: number
  status: string
  label: string
  confidence: number | null
  risk: string | null
  model: string
  processing_time_ms?: number
  processing_ms?: number
  filename?: string
  duration?: number
  sample_rate?: number
  model_output?: string
}

export type AnalysisRecord = Detection & { created_at: string }

export type Settings = {
  backend_url: string
  model_name: string
  confidence_threshold: number
  spoof_threshold: number
  high_risk_threshold: number
  smoothing_window: number
  sample_rate: number
  input_samples: number
  max_upload_bytes: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function getModelStatus(): Promise<ModelStatus> {
  const response = await fetch(`${API_BASE}/api/model/status`)
  if (!response.ok) throw new Error('Backend is unavailable')
  return response.json()
}

export async function getHealth() {
  const response = await fetch(`${API_BASE}/api/health`)
  if (!response.ok) throw new Error('Backend is unavailable')
  return response.json()
}

export async function analyzeAudio(file: File): Promise<Detection> {
  const data = new FormData()
  data.append('audio', file)
  const response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: data })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Analysis failed')
  return payload
}

export async function analyzeChunk(audio: ArrayBuffer): Promise<Detection> {
  const response = await fetch(`${API_BASE}/api/analyze/chunk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: Array.from(new Uint8Array(audio)), chunk_index: 0, timestamp: 0 }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Chunk analysis failed')
  return payload
}

export async function getHistory(): Promise<AnalysisRecord[]> {
  const response = await fetch(`${API_BASE}/api/history`)
  if (!response.ok) throw new Error('History unavailable')
  return (await response.json()).items
}

export async function deleteHistory(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/history/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('History item could not be deleted')
}

export async function getSettings(): Promise<Settings> {
  const response = await fetch(`${API_BASE}/api/settings`)
  if (!response.ok) throw new Error('Settings unavailable')
  return response.json()
}

export async function reloadModel(): Promise<ModelStatus> {
  const response = await fetch(`${API_BASE}/api/model/reload`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.detail || 'Model reload failed')
  return payload
}
