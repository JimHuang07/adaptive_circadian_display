import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Area, ComposedChart, Line, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DAY, DEFAULTS, DEFAULT_TIME, FIELDS, PRESETS, bedtime, clock, phaseAt, phases, randomSchedule, saturation, validate } from './schedule'
import type { Preset, Schedule } from './schedule'
import { Phone } from './phone'
import { Optimization } from './optimization'
import { Feedback } from './feedback'
import { loadSchedule, saveSchedule } from './feedback-store'
import './style.css'

function App() {
  const [schedule, setSchedule] = useState(() => {
    try {
      return loadSchedule(window.localStorage, import.meta.env.BASE_URL)
    } catch {
      return DEFAULTS
    }
  })
  const [draft, setDraft] = useState(schedule)
  const [preset, setPreset] = useState<Preset>(PRESETS[0])
  const [baseline, setBaseline] = useState<Preset | ''>('')
  const [minute, setMinute] = useState(DEFAULT_TIME)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [mode, setMode] = useState<'synthetic' | 'human'>('synthetic')
  const errors = validate(draft)
  const time = Math.floor(minute)
  const value = Math.round(saturation(schedule, time, preset))

  function update(next: Schedule) {
    setDraft(next)
    if (!validate(next).length) setSchedule(next)
  }

  useEffect(() => {
    try {
      saveSchedule(window.localStorage, import.meta.env.BASE_URL, schedule)
    } catch {
      // The demo remains interactive when browser storage is disabled.
    }
  }, [schedule])

  function preview(candidate: Schedule) {
    update(candidate)
    setPreset(PRESETS[0])
  }

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    function tick(now: number) {
      const elapsed = now - last
      last = now
      setMinute(t => (t + elapsed * DAY / (speed * 1000)) % DAY)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed])

  const chart = useMemo(() => {
    const points = new Set(Array.from({ length: DAY + 1 }, (_, index) => index))
    const bed = bedtime(schedule) % DAY
    if (preset === 'Fixed Bedtime Grayscale' || baseline === 'Fixed Bedtime Grayscale') {
      for (const boundary of [bed || DAY, schedule.wake]) {
        if (boundary > 0) points.add(boundary - 0.001)
      }
    }
    return [...points].sort((a, b) => a - b).map(t => ({
      t, saturation: saturation(schedule, t, preset),
      baseline: baseline ? saturation(schedule, t, baseline) : undefined,
    }))
  }, [schedule, preset, baseline])

  const bands = useMemo(() => {
    const points = [...new Set([...phases(schedule).map(p => p.start % DAY), DAY])].sort((a, b) => a - b)
    const palette = phases(schedule)
    return points.slice(0, -1).map((start, index) => ({
      start, end: points[index + 1],
      color: palette.find(phase => phase.label === phaseAt(schedule, start))?.color,
    }))
  }, [schedule])

  function seek(next: number) {
    setMinute(Math.min(DAY - 1, Math.max(0, Math.round(next))))
  }

  return <div className="shell">
    <header className="masthead">
      <div className="brand"><span className="brand-icon" aria-hidden="true">◒</span><span>Display <strong>Lab</strong></span></div>
      <span className="status"><i /> Simulation mode</span>
    </header>
    <main>
      <div className="intro">
        <h1>Adaptive Circadian Display</h1>
        <p>Explore how screen color changes across your day.</p>
      </div>
      <div className="dashboard">
        <section className="card preview" aria-labelledby="preview-title">
          <h2 id="preview-title">Phone preview</h2>
          <Phone time={clock(time)} saturation={value} />
          <div className="readouts">
            <div><span>Saturation</span><strong>{value}%</strong></div>
            <div><span>Simulated time</span><strong>{clock(time)}</strong></div>
            <div><span>Daily phase</span><strong className="phase">{phaseAt(schedule, time)}</strong></div>
          </div>
          <label className="timeline">Time of day<input type="range" min={0} max={DAY - 1} value={time} aria-valuetext={clock(time)} onChange={e => seek(e.target.valueAsNumber)} /></label>
          <div className="range-ends"><span>00:00</span><span>23:59</span></div>
          <div className="playback">
            <button className="primary" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play 24h'}</button>
            <button onClick={() => { setPlaying(false); setMinute(DEFAULT_TIME) }}>Reset time</button>
            <select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
              <option value="60">1× speed</option><option value="30">2× speed</option><option value="15">4× speed</option>
            </select>
          </div>
        </section>
        <div className="right">
          <section className="card chart-card" aria-labelledby="chart-title">
            <h2 id="chart-title">Saturation schedule</h2>
            <div className="selects">
              <label>Preview schedule<select value={preset} onChange={e => setPreset(e.target.value as Preset)}>{PRESETS.map(p => <option key={p}>{p}</option>)}</select></label>
              <label>Compare with<select value={baseline} onChange={e => setBaseline(e.target.value as Preset | '')}>
                <option value="">No comparison</option>{PRESETS.slice(1).map(p => <option key={p}>{p}</option>)}
              </select></label>
            </div>
            <div className="chart" aria-label="24-hour saturation chart" onClick={event => {
              const bounds = event.currentTarget.getBoundingClientRect()
              const x = event.clientX - bounds.left - 45
              const plotWidth = bounds.width - 61
              if (plotWidth > 0 && x >= 0 && x <= plotWidth) seek(x * DAY / plotWidth)
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
                  <defs><linearGradient id="saturation-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6451cf" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#6451cf" stopOpacity={0.03} />
                  </linearGradient></defs>
                  {bands.map(b => <ReferenceArea key={b.start} x1={b.start} x2={b.end} fill={b.color} fillOpacity={0.8} strokeOpacity={0} />)}
                  <CartesianGrid vertical={false} stroke="#dedee9" strokeDasharray="3 4" />
                  <XAxis dataKey="t" type="number" domain={[0, DAY]} ticks={[0, 360, 720, 1080, DAY]} tickFormatter={t => t === DAY ? '24:00' : clock(t)} tickLine={false} axisLine={false} />
                  <YAxis width={45} domain={[0, 100]} ticks={[0,25,50,75,100]} tickFormatter={v => v + '%'} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={t => t === DAY ? '24:00' : clock(Math.round(Number(t)))} formatter={v => Math.round(Number(v)) + '%'} />
                  <Area dataKey="saturation" name={preset} stroke="#6451cf" strokeWidth={3} fill="url(#saturation-fill)" dot={false} isAnimationActive={false} />
                  {baseline && <Line dataKey="baseline" name={baseline} stroke="#425b70" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
                  <ReferenceLine x={time} stroke="#4939a5" strokeDasharray="4 4" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend"><span><i />{preset}</span>{baseline && <span><i className="dashed" />{baseline}</span>}</div>
          </section>
          <section className="card controls" aria-labelledby="controls-title">
            <div className="section-head"><h2 id="controls-title">Schedule parameters</h2><button onClick={() => { update(DEFAULTS); setPreset(PRESETS[0]) }}>Reset defaults</button></div>
            <div className="fields">
              {FIELDS.map(({ key, label, min, max, unit, hint }) => <div className="field" key={key}>
                <span><label htmlFor={'parameter-' + key}>{label}</label><output>{unit === 'time' ? clock(draft[key]) : draft[key] + unit}</output></span>
                <input id={'parameter-' + key} type="range" min={min} max={max} value={draft[key]} aria-describedby={'hint-' + key} aria-valuetext={unit === 'time' ? clock(draft[key]) : draft[key] + unit} aria-invalid={errors.some(e => e.keys.includes(key))} onChange={e => update({ ...draft, [key]: e.target.valueAsNumber })} />
                <small id={'hint-' + key}>{hint}</small>
              </div>)}
            </div>
            <div className="routine">
              {(['wake', 'bed'] as const).map(key => <label key={key}>{key === 'wake' ? 'Wake-up time' : 'Bedtime'}
                <input type="time" value={clock(draft[key])} aria-invalid={errors.some(e => e.keys.includes(key))} onChange={e => {
                  if (e.target.value) update({ ...draft, [key]: e.target.valueAsNumber / 60000 })
                }} />
              </label>)}
              <button disabled={errors.length > 0} onClick={() => { update(randomSchedule(schedule)); setPreset(PRESETS[0]) }}>Randomize</button>
            </div>
            {errors.length > 0 && <div className="errors" role="status">{errors.map(e => <p key={e.message}>{e.message}</p>)}<p>Showing the last valid schedule.</p></div>}
          </section>
        </div>
      </div>
      <div className="lab-modes" aria-label="Evaluation mode">
        <button aria-pressed={mode === 'synthetic'} onClick={() => setMode('synthetic')}>Synthetic evaluation</button>
        <button aria-pressed={mode === 'human'} onClick={() => setMode('human')}>Human feedback</button>
      </div>
      <div hidden={mode !== 'synthetic'}><Optimization schedule={schedule} onPreview={preview} visible={mode === 'synthetic'} /></div>
      {mode === 'human' && <Feedback key={schedule.wake + ':' + schedule.bed} schedule={schedule}
        canRate={!errors.length && preset === PRESETS[0]} onPreview={preview} />}
    </main>
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
