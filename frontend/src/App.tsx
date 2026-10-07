import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeAudio, deleteHistory, getHistory, getModelStatus, getSettings, reloadModel } from './api'
import { Icon, SectionHeader, StatusPill, Timeline, Waveform } from './components'
import type { ModelState, Segment, View } from './types'
import './App.css'

const nav: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'offline', label: 'Offline Analysis', icon: 'upload' },
  { id: 'live', label: 'Live Call Security', icon: 'phone' },
  { id: 'history', label: 'Detection History', icon: 'history' },
  { id: 'evaluation', label: 'Evaluation', icon: 'chart' },
  { id: 'project', label: 'Project Info', icon: 'info' },
  { id: 'technical', label: 'Technical Details', icon: 'code' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

const pageTitle: Record<View, string> = {
  dashboard: 'Dashboard', offline: 'Offline Analysis', live: 'Live Call Security',
  history: 'Detection History', evaluation: 'Evaluation', project: 'Project Info',
  technical: 'Technical Details', settings: 'Settings',
}

function buildPcmWav(samples: Uint8Array, sampleRate: number) {
  const dataSize = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) }
  write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE'); write(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 16, true); view.setUint16(34, 16, true)
  write(36, 'data'); view.setUint32(40, dataSize, true)
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, (samples[i] - 128) / 128 * 32767, true)
  return buffer
}

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [model, setModel] = useState<import('./api').ModelStatus>({ backend: 'offline', model_loaded: false, device: 'cpu', error: null, model: 'AASIST', checkpoint_sha256: null })
  const [backend, setBackend] = useState<'online' | 'offline'>('offline')
  const [history, setHistory] = useState<any[]>([])
  const [settings, setSettings] = useState({ backend_url: 'http://127.0.0.1:8000', model_name: 'AASIST', confidence_threshold: 0.6, spoof_threshold: 0.55, high_risk_threshold: 0.75, smoothing_window: 5 })
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<any>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [waveform, setWaveform] = useState<number[]>([])
  const [live, setLive] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyRisk, setHistoryRisk] = useState('all')
  const fileInput = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const frameRef = useRef<number | null>(null)
  const chunkRef = useRef(0)
  const lastChunkRef = useRef(0)
  const liveAudioRef = useRef<number[]>([])

  const refresh = useCallback(async () => {
    try { const current = await getModelStatus(); setModel(current); setBackend('online') }
    catch { setBackend('offline') }
  }, [])
  useEffect(() => { void refresh(); void getSettings().then(setSettings); void getHistory().then(setHistory) }, [refresh])
  useEffect(() => { const timer = window.setInterval(() => live && setSeconds(value => value + 1), 1000); return () => window.clearInterval(timer) }, [live])
  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach(track => track.stop()); void contextRef.current?.close() }, [])

  const state: ModelState = backend === 'offline' ? 'offline' : model.model_loaded ? 'ready' : model.error ? 'error' : 'not-loaded'
  const addSegment = (item: any, time = seconds) => setSegments(current => [...current.slice(-5), { time, label: item.label, confidence: item.confidence || 0, risk: item.risk || 'unknown', modelOutput: item.model_output || '' }])

  const runFile = async (file: File) => {
    setLoading(true); setNotice('Preparing audio…'); setResult(null)
    try {
      const item = await analyzeAudio(file)
      setResult(item); setNotice('Analysis complete. Results originate from AASIST inference.')
      addSegment(item, 0); setHistory(current => [{ ...item, created_at: new Date().toISOString() }, ...current].slice(0, 8))
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Analysis failed') }
    finally { setLoading(false) }
  }

  const startLive = async () => {
    setLive(true); setSeconds(0); setSegments([]); setWaveform([]); setNotice('Analyzing incoming speech in simulated call mode')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      streamRef.current = stream; contextRef.current = new AudioContext(); analyserRef.current = contextRef.current.createAnalyser(); analyserRef.current.fftSize = 256
      contextRef.current.createMediaStreamSource(stream).connect(analyserRef.current)
      const data = new Uint8Array(analyserRef.current.fftSize)
      const draw = () => {
        analyserRef.current?.getByteTimeDomainData(data)
        setWaveform(Array.from(data, value => Math.abs(value - 128) / 128 * 45))
        liveAudioRef.current.push(...data)
        if (liveAudioRef.current.length >= contextRef.current!.sampleRate && performance.now() - lastChunkRef.current > 1200) {
          const audio = liveAudioRef.current.splice(0, contextRef.current!.sampleRate)
          if (audio.some(value => Math.abs(value - 128) > 8)) {
            lastChunkRef.current = performance.now()
            const wav = buildPcmWav(new Uint8Array(audio), contextRef.current!.sampleRate)
            const payload = { audio: Array.from(new Uint8Array(wav)), chunk_index: chunkRef.current++, timestamp: seconds }
            fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'}/api/live/chunk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(async response => {
              const item = await response.json().catch(() => ({}))
              if (response.ok && item.status !== 'unavailable') { setResult(item); addSegment(item); setNotice(item.status === 'spoof' ? 'Potential impersonation evidence detected' : 'Likely genuine speech classification returned') }
            }).catch(() => setNotice('Chunk processing unavailable'))
          }
        }
        frameRef.current = requestAnimationFrame(draw)
      }
      draw()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Microphone permission is required for live capture.') }
  }

  const stopLive = () => { setLive(false); setNotice('Simulated call stopped'); if (frameRef.current) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; void contextRef.current?.close(); contextRef.current = null }
  const retry = async () => { setLoading(true); try { const item = await reloadModel(); setModel(item); setBackend('online'); setNotice('Model status refreshed') } catch (error) { setNotice(error instanceof Error ? error.message : 'Model reload failed') } finally { setLoading(false) } }
  const remove = async (id: number) => { await deleteHistory(id); setHistory(current => current.filter(item => item.id !== id)) }
  const statusLabel = state === 'ready' ? 'MODEL READY' : state === 'offline' ? 'BACKEND OFFLINE' : 'MODEL NOT LOADED'
  const selectView = (next: View) => { setView(next); setMobileOpen(false) }

  const uploadInput = (accept = 'audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg') => <input ref={fileInput} type="file" accept={accept} onChange={event => { const file = event.target.files?.[0]; if (file) void runFile(file); event.target.value = '' }} />

  const dashboard = <>
    <SectionHeader eyebrow="SECURITY OPERATIONS" title="Voice intelligence overview" description="Monitor model availability, analysis results, and active risk signals without storing raw audio." action={<button className="button button-primary" onClick={() => selectView('offline')}><Icon name="upload" /> Run analysis</button>} />
    <div className="metric-grid">
      <MetricCard icon={<Icon name="shield" />} title="MODEL STATUS" value={model.model || 'AASIST'} detail={state === 'ready' ? 'AASIST · READY' : state === 'offline' ? 'BACKEND · OFFLINE' : 'AASIST · NOT LOADED'} tone={state === 'ready' ? 'green' : 'amber'} />
      <MetricCard icon={<Icon name="chart" />} title="TOTAL ANALYSES" value={String(history.length)} detail="Metadata records only" tone="cyan" />
      <MetricCard icon={<Icon name="alert" />} title="POTENTIAL SPOOF CASES" value={String(history.filter(item => item.status === 'spoof').length)} detail="Model-assisted labels" tone="amber" />
      <MetricCard icon={<Icon name="alert" />} title="HIGH RISK CASES" value={String(history.filter(item => item.risk === 'high').length)} detail="Sustained risk signals" tone="red" />
    </div>
    <div className="dashboard-grid">
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">SYSTEM STATUS</span><h2>Backend health</h2></div><StatusPill state={state} /></div>
        <div className="system-list"><SystemRow name="Backend" value={backend === 'online' ? 'ONLINE' : 'OFFLINE'} /><SystemRow name="Audio processor" value="READY" /><SystemRow name="AASIST model" value={state === 'ready' ? 'READY' : 'UNAVAILABLE'} /><SystemRow name="History" value="SQLITE" /></div>
      </article>
      <article className="panel">
        <div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Latest detections</h2></div><button className="text-button" onClick={() => selectView('history')}>View all</button></div>
        <div className="recent-list">{history.slice(0, 4).map(item => <div className={`recent-item ${item.risk}`} key={item.id}><span className={`risk-dot ${item.risk}`} /><div><strong>{item.label}</strong><small>{item.filename} · {item.model}</small></div><b>{item.confidence == null ? '—' : `${item.confidence}%`}</b></div>)}</div>
      </article>
    </div>
    <article className="panel live-preview">
      <div className="panel-heading"><div><span className="eyebrow">LIVE MONITORING</span><h2>Near-real-time call analysis</h2></div><button className="button button-secondary" onClick={() => selectView('live')}><Icon name="phone" /> Open live security</button></div>
      <Waveform samples={waveform} isLive={live} />
      <div className="live-preview-footer"><span><i className={live ? 'pulse active' : 'pulse'} /> {live ? 'STREAM ACTIVE' : 'SIMULATED CALL STANDBY'}</span><span>Model: {model.model}</span><span>Temporal window: {settings.smoothing_window} segments</span></div>
    </article>
  </>

  const offline = <>
    <SectionHeader eyebrow="OFFLINE ANALYSIS" title="Upload an audio sample" description="Assess a recorded sample using the configured AASIST checkpoint. Raw audio is not persisted automatically." />
    <div className="offline-grid">
      <article className="panel upload-panel">
        <div className="card-heading"><div><span className="eyebrow">INPUT</span><h2>Audio upload</h2></div><span className="format-tag">WAV · MP3 · FLAC · M4A · OGG</span></div>
        <div className="drop-zone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void runFile(file) }}>
          {uploadInput()}
          <div className="upload-icon"><Icon name="upload" /></div><h3>Drop audio here</h3><p>Maximum 25 MB</p><button className="button button-primary" onClick={() => fileInput.current?.click()}>Choose audio file</button><small>Processing occurs server-side using the real AASIST model.</small>
        </div>
        <div className="upload-policy"><Icon name="shield" /><div><strong>Privacy by design</strong><p>Raw audio is not retained by default. Analysis metadata is stored separately.</p></div></div>
      </article>
      <article className="panel result-panel">
        <div className="card-heading"><div><span className="eyebrow">DETECTION RESULT</span><h2>Model output</h2></div><StatusPill state={result ? (result.status === 'spoof' ? 'error' : 'ready') : model.model_loaded ? 'ready' : state} label={result ? (result.status === 'spoof' ? 'SUSPICIOUS' : 'LIKELY HUMAN') : loading ? 'ANALYZING' : model.model_loaded ? 'READY' : 'UNAVAILABLE'} /></div>
        {loading ? <div className="analysis-loading"><div className="loader-ring" /><strong>Analyzing audio…</strong><p>Validating recording · Running AASIST · Calculating confidence</p></div> : result ? <>
          <div className={`result-hero ${result.status}`}><div><span className="result-label">{result.status === 'spoof' ? 'POTENTIAL AI-GENERATED VOICE' : 'LIKELY GENUINE HUMAN SPEECH'}</span><h3>{result.label}</h3><p>{result.status === 'spoof' ? 'Potential synthetic or cloned speech evidence was returned by the model.' : 'The model returned a genuine-speech classification. This is not proof of identity.'}</p></div><span className={`result-icon ${result.status}`}><Icon name={result.status === 'spoof' ? 'alert' : 'shield'} /></span></div>
          {result.status === 'spoof' && <div className="security-alert"><Icon name="alert" /><div><strong>VOICE IMPERSONATION WARNING</strong><p>Do not share sensitive information or perform financial actions based only on this voice. Verify the caller using another trusted communication channel.</p></div></div>}
          <div className="confidence-block"><div className="confidence-title"><span>Model confidence</span><strong>{result.confidence?.toFixed(1)}%</strong></div><div className="confidence-track"><span style={{ width: `${result.confidence || 0}%` }} /></div><small>Model-assisted confidence, not a guarantee of identity.</small></div>
          <div className="result-details"><div><span>Risk</span><strong className={`risk-text ${result.risk}`}>{result.risk?.toUpperCase()}</strong></div><div><span>Duration</span><strong>{result.duration?.toFixed(2)} s</strong></div><div><span>Sample rate</span><strong>{result.sample_rate} Hz</strong></div><div><span>Processing</span><strong>{result.processing_ms} ms</strong></div></div>
        </> : <div className="empty-result"><span className="empty-result-icon"><Icon name="upload" /></span><h3>Ready for analysis</h3><p>Upload an audio sample to begin. The result will include confidence, risk, and model metadata.</p></div>}
        {!model.model_loaded && <div className="model-warning"><Icon name="alert" /><div><strong>Detection model unavailable</strong><p>Configure a compatible checkpoint before running inference.</p><button className="button button-primary" onClick={() => void retry()}>Retry model load</button></div></div>}
      </article>
    </div>
    {notice && <div className="notice"><Icon name="info" /><span>{notice}</span></div>}
  </>

  const liveView = <>
    <SectionHeader eyebrow="LIVE CALL SECURITY" title="Near-real-time voice analysis" description="This demonstration accepts microphone input or an audio file. It does not intercept third-party calls." />
    <div className="live-layout">
      <article className="panel call-panel">
        <div className="call-header"><div className="caller-avatar">?</div><div><span>INCOMING CALLER</span><strong>Unknown / Incoming Caller</strong><small>No identity verified</small></div><span className="demo-badge">SIMULATED CALL — DEMONSTRATION MODE</span></div>
        <div className="call-timer">{seconds.toString().padStart(2, '0')}</div>
        <div className="live-wave"><Waveform samples={waveform} isLive={live} /><span>{live ? 'LIVE AUDIO INPUT' : 'AUDIO STANDBY'}</span></div>
        <div className="live-controls"><button className="button button-primary" onClick={() => void startLive()} disabled={live}><Icon name="play" /> Start simulated call</button><button className="button button-danger" onClick={stopLive} disabled={!live}><Icon name="stop" /> Stop call</button><button className="button button-secondary" onClick={() => fileInput.current?.click()}><Icon name="upload" /> Use audio file</button>{uploadInput()}</div>
        <div className="live-result"><div><span>Current prediction</span><strong>{result?.label || 'Awaiting analysis'}</strong></div><div><span>Confidence</span><strong>{result?.confidence == null ? '—' : `${result.confidence}%`}</strong></div><div><span>Risk</span><strong className={result?.risk || ''}>{result?.risk?.toUpperCase() || 'NONE'}</strong></div></div>
      </article>
      <aside className="panel monitoring-panel">
        <div className="panel-heading"><div><span className="eyebrow">SECURITY STATUS</span><h2>Detection monitoring</h2></div><StatusPill state={state} /></div>
        <div className="security-row"><span>Model</span><strong>{model.model}</strong></div><div className="security-row"><span>Device</span><strong>{model.device.toUpperCase()}</strong></div><div className="security-row"><span>Input</span><strong>{live ? 'Microphone' : 'Simulated'}</strong></div><div className="security-row"><span>Call duration</span><strong>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}</strong></div>
        <div className="timeline-title"><span>Recent detection timeline</span><small>{segments.length} samples</small></div><Timeline segments={segments} />
        <div className="monitor-note"><Icon name="info" /><p>Simulated input only. The application does not connect to cellular networks or messaging platforms.</p></div>
      </aside>
    </div>
    {notice && <div className="notice"><Icon name="info" /><span>{notice}</span></div>}
  </>

  const historyView = <>
    <SectionHeader eyebrow="DETECTION HISTORY" title="Analysis records" description="Search, filter, and inspect metadata-only records. Raw audio is not retained by default." />
    <div className="history-toolbar"><label className="search-field"><Icon name="search" /><input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Search filename or result" /></label><select value={historyRisk} onChange={event => setHistoryRisk(event.target.value)}><option value="all">All risk levels</option><option value="low">Low risk</option><option value="medium">Medium risk</option><option value="high">High risk</option></select><button className="button button-secondary" onClick={() => setHistory(current => [...current].reverse())}>Sort newest</button></div>
    <div className="history-table"><div className="history-head"><span>Date & time</span><span>Audio</span><span>Result</span><span>Confidence</span><span>Risk</span><span /></div>{history.filter(item => (!historySearch || `${item.filename} ${item.label}`.toLowerCase().includes(historySearch.toLowerCase())) && (historyRisk === 'all' || item.risk === historyRisk)).map(item => <div className="history-row" key={item.id}><div><strong>{new Date(item.created_at).toLocaleString()}</strong><small>{item.model} · {item.processing_ms} ms</small></div><div><strong>{item.filename}</strong><small>{item.duration?.toFixed(2)} seconds · {item.sample_rate} Hz</small></div><div><b>{item.label}</b><small>{item.model_output || item.status}</small></div><div>{item.confidence == null ? '—' : `${item.confidence}%`}</div><div><span className={`risk-badge ${item.risk}`}>{item.risk?.toUpperCase()}</span></div><div><button className="icon-button" onClick={() => void remove(item.id)} aria-label="Delete record"><Icon name="trash" /></button></div></div>)}</div>
  </>

  const evaluation = <>
    <SectionHeader eyebrow="EVALUATION" title="Technical assessment workspace" description="Calculate metrics from a properly labelled, separated dataset. No benchmark values are presented as project results." />
    <div className="evaluation-grid"><article className="panel"><span className="eyebrow">PROJECT EVALUATION</span><h2>Evaluation not yet performed.</h2><p>Load a labelled ASVspoof 2019 LA test set, then compute accuracy, precision, recall, F1, ROC-AUC, and EER without mixing training or validation data.</p><button className="button button-primary">Prepare evaluation dataset</button></article><article className="panel"><span className="eyebrow">OFFICIAL AASIST BENCHMARK</span><h2>Separate from project metrics</h2><p>The official AASIST repository reports its own benchmark metrics. These are not calculated by A.U.D.I.O. and must not be presented as project results.</p><div className="metric-row"><span>Accuracy</span><b>Not calculated</b><span>Precision</span><b>Not calculated</b><span>Recall</span><b>Not calculated</b><span>F1</span><b>Not calculated</b><span>ROC-AUC</span><b>Not calculated</b><span>EER</span><b>Not calculated</b></div></article></div>
  </>

  const project = <>
    <SectionHeader eyebrow="PROJECT INFO" title="Why A.U.D.I.O. exists" description="An AI-assisted security boundary for detecting synthetic speech and reducing impersonation risk." />
    <div className="project-grid"><article className="panel"><span className="eyebrow">SECURITY CONTEXT</span><h2>Voice cloning can support fraud and social engineering.</h2><p>Realistic synthetic speech can impersonate people, create deceptive communication, or support unauthorized financial and security actions. Detection is probabilistic and must be combined with identity verification.</p><div className="threat-tags"><span>Fraud</span><span>Social engineering</span><span>Unauthorized communication</span></div></article><article className="panel"><span className="eyebrow">SYSTEM ARCHITECTURE</span><div className="arch-line"><span>Audio input</span><i>↓</i><span>Preprocessing</span><i>↓</i><span>AASIST</span><i>↓</i><span>Prediction</span><i>↓</i><span>Risk</span><i>↓</i><span>Alert</span></div><p>The API runs inference in a reusable process. History stores metadata, while raw audio remains optional and explicit.</p></article></div>
  </>

  const technical = <>
    <SectionHeader eyebrow="TECHNICAL DETAILS" title="AASIST implementation" description="A concise engineering view of the model architecture, input contract, and checkpoint validation." />
    <div className="technical-grid"><article className="panel"><span className="eyebrow">MODEL</span><h2>AASIST</h2><p>Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention Networks. It processes spectro-temporal features with graph attention and returns a two-class classification.</p></article><article className="panel"><span className="eyebrow">STACK</span><h2>PyTorch · FastAPI · React</h2><p>PyTorch performs inference, FastAPI exposes typed endpoints, and React provides the dashboard. Audio is decoded and normalized to the configured sample rate.</p></article><article className="panel"><span className="eyebrow">INPUT & OUTPUT</span><h2>16 kHz · 64,600 samples</h2><p>The official AASIST configuration uses 16 kHz input and 64,600 samples. The application validates the checkpoint before inference.</p></article><article className="panel"><span className="eyebrow">LABEL MAPPING</span><h2>Verified from model output</h2><p>The application maps the higher-confidence output to the display label rather than assuming class 0 or class 1.</p></article></div>
  </>

  const settingsView = <>
    <SectionHeader eyebrow="SETTINGS" title="Detection configuration" description="Adjust operational thresholds and service parameters. Model availability cannot be simulated or forced." />
    <div className="settings-grid"><article className="panel"><span className="eyebrow">MODEL & SERVICE</span><h2>Backend URL</h2><input value={settings.backend_url} onChange={event => setSettings({ ...settings, backend_url: event.target.value })} /><h2>Model name</h2><input value={settings.model_name} onChange={event => setSettings({ ...settings, model_name: event.target.value })} /><button className="button button-primary" onClick={() => void retry()}>Validate model connection</button></article><article className="panel"><span className="eyebrow">DECISION THRESHOLDS</span><h2>Confidence threshold</h2><input type="number" min="0" max="1" step="0.01" value={settings.confidence_threshold} onChange={event => setSettings({ ...settings, confidence_threshold: Number(event.target.value) })} /><h2>Spoof threshold</h2><input type="number" min="0" max="1" step="0.01" value={settings.spoof_threshold} onChange={event => setSettings({ ...settings, spoof_threshold: Number(event.target.value) })} /><h2>High-risk threshold</h2><input type="number" min="0" max="1" step="0.01" value={settings.high_risk_threshold} onChange={event => setSettings({ ...settings, high_risk_threshold: Number(event.target.value) })} /><h2>Temporal smoothing window</h2><input type="number" min="1" max="20" value={settings.smoothing_window} onChange={event => setSettings({ ...settings, smoothing_window: Number(event.target.value) })} /></article></div>
  </>

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span /></div><div><strong>A.U.D.I.O.</strong><small>AI-Driven Uncertainty<br />and Detection for Impersonation Overwatch</small></div></div>
      <nav aria-label="Primary navigation">{nav.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => selectView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-footer"><div className={`model-state ${state}`}><span /><div><small>AASIST</small><strong>{statusLabel}</strong></div></div><p>Detect. Verify. Stay Protected.</p><small>University demonstration system</small></div>
    </aside>
    {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <main className="main-content">
      <header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Icon name="grid" /></button><div><span className="topbar-kicker">SECURITY OPERATIONS</span><h1>{pageTitle[view]}</h1></div></div><div className="topbar-status"><div><span className={`status-dot ${backend}`} />Backend <strong>{backend === 'online' ? 'ONLINE' : 'OFFLINE'}</strong></div><div><span className="status-dot ready" />Model <strong>AASIST</strong></div><div>Device <strong>{model.device.toUpperCase()}</strong></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh model status"><Icon name="refresh" /></button></div></header>
      <div className="content">{view === 'dashboard' && dashboard}{view === 'offline' && offline}{view === 'live' && liveView}{view === 'history' && historyView}{view === 'evaluation' && evaluation}{view === 'project' && project}{view === 'technical' && technical}{view === 'settings' && settingsView}</div>
    </main>
  </div>
}

function MetricCard({ icon, title, value, detail, tone = 'cyan' }: { icon: React.ReactNode; title: string; value: string; detail: string; tone?: 'cyan' | 'green' | 'amber' | 'red' }) { return <article className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><span>{title}</span><strong>{value}</strong><small>{detail}</small></div></article> }
function SystemRow({ name, value }: { name: string; value: string }) { return <div className="system-row"><span>{name}</span><b className={value === 'READY' || value === 'ONLINE' ? 'online' : 'offline'}>{value}</b></div> }

export default App
