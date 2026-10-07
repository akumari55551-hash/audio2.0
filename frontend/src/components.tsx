import type { ReactNode } from 'react'
import type { ModelState, Segment } from './types'

export function StatusPill({ state, label }: { state: ModelState; label?: string }) {
  const labels = { ready: 'READY', 'not-loaded': 'NOT LOADED', offline: 'OFFLINE', error: 'MODEL ERROR' }
  return <span className={`status-pill ${state}`}><i />{label || labels[state]}</span>
}

export function MetricCard({ icon, title, value, detail, tone = 'cyan' }: { icon: ReactNode; title: string; value: string; detail: string; tone?: 'cyan' | 'green' | 'amber' | 'red' }) {
  return <article className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><span>{title}</span><strong>{value}</strong><small>{detail}</small></div></article>
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="section-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
}

export function Waveform({ samples, isLive = false }: { samples: number[]; isLive?: boolean }) {
  const bars = samples.length ? samples : Array.from({ length: 90 }, (_, i) => 8 + Math.abs(Math.sin(i * 0.7)) * 26)
  return <div className={`waveform ${isLive ? 'live' : ''}`} aria-label="Audio waveform">{bars.map((height, index) => <span key={`${index}-${height}`} style={{ height: `${height}%` }} />)}</div>
}

export function Timeline({ segments }: { segments: Segment[] }) {
  return <div className="timeline-list">{segments.length ? segments.slice(-8).reverse().map((segment, index) => <div className={`timeline-row ${segment.risk}`} key={`${segment.time}-${index}`}><time>{formatTime(segment.time)}</time><span className="timeline-dot" /><div><strong>{segment.label}</strong><small>{segment.confidence.toFixed(1)}% · {segment.risk.toUpperCase()} RISK</small></div></div>) : <div className="empty-state">No model predictions have been recorded yet.</div>}</div>
}

export function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.45-1.19a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
    chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    code: <><path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.19 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.19H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .19-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.38.36.72.66 1 .3.28.68.43 1.08.43H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>,
    alert: <><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    play: <path d="m8 5 11 7-11 7Z"/>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 15H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.info}</svg>
}
