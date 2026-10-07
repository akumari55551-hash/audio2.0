export type View = 'dashboard' | 'offline' | 'live' | 'history' | 'evaluation' | 'project' | 'technical' | 'settings'

export type ModelState = 'ready' | 'not-loaded' | 'offline' | 'error'

export type Segment = {
  time: number
  label: string
  confidence: number
  risk: string
  modelOutput: string
}
