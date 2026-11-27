import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { compute } from './bo/client'
import { METRICS, RATINGS } from './bo/human'
import type { Evaluation, Metric, Recommendation } from './bo/human'
import { feedbackStore } from './feedback-store'
import { clock, FIELDS } from './schedule'
import type { Schedule } from './schedule'

const store = () => feedbackStore(window.localStorage, import.meta.env.BASE_URL)

export function Feedback({ schedule, canRate, onPreview }: {
  schedule: Schedule
  canRate: boolean
  onPreview: (schedule: Schedule) => void
}) {
  const [history, setHistory] = useState<Evaluation[]>([])
  const [selected, setSelected] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [recommendation, setRecommendation] = useState<{ source: string; result: Recommendation }>()
  const initialSchedule = useRef(schedule)
  const key = JSON.stringify(schedule)
  const suggested = recommendation?.source === key ? recommendation.result : undefined
  const inspected = history.find(row => row.id === selected) ?? history[0]
  const best = history.reduce<Evaluation | undefined>((top, row) => !top || row.score > top.score ? row : top, undefined)

  useEffect(() => {
    const routine = initialSchedule.current
    function reload() {
      try {
        setHistory(store().history(routine))
        setRecommendation(undefined)
      } catch {
        setError('Saved feedback could not be read from this browser.')
      } finally {
        setLoading(false)
      }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === feedbackStore(event.storageArea!, import.meta.env.BASE_URL).key(routine)) reload()
    }
    reload()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const ratings = Object.fromEntries(RATINGS.map(([rating]) => [rating, Number(fields.get(rating))])) as Evaluation['ratings']
    const metrics = Object.fromEntries((Object.keys(METRICS) as Metric[]).flatMap(name => {
      const value = fields.get(name)
      return value ? [[name, Number(value)]] : []
    }))
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const storage = store()
      const save = () => storage.submit(schedule, ratings, metrics)
      const rows = navigator.locks ? await navigator.locks.request(storage.key(schedule), save) : save()
      setHistory(rows)
      setSelected(undefined)
      setRecommendation(undefined)
      form.reset()
      setMessage('Evaluation saved.')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function requestRecommendation() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await compute('recommend', { schedule, history: store().history(schedule) })
      setRecommendation({ source: key, result })
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function exportHistory() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'saturation-evaluations.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="card optimization" aria-labelledby="feedback-title">
    <div className="section-head"><h2 id="feedback-title">Human feedback</h2><span className="status">{clock(schedule.wake)} wake · {clock(schedule.bed)} bed</span></div>
    <p className="lab-note">Rate the adaptive schedule in the phone preview. Brief preview ratings reflect visual preferences. Measuring changes in phone use or productivity requires a field study.</p>
    {!canRate && <p className="lab-note">Select Adaptive Saturation and resolve any schedule conflicts before rating.</p>}
    <form key={key} onSubmit={submit}>
      <fieldset disabled={busy || loading || !canRate} className="lab-settings">
        <legend>Ratings from 1 (low) to 10 (high)</legend>
        {RATINGS.map(([name, label]) => <label key={name}>{label}<input type="number" min="1" max="10" step="1" name={name} required /></label>)}
      </fieldset>
      <fieldset disabled={busy || loading || !canRate} className="lab-settings">
        <legend>Optional daily observations</legend>
        <label>Social media minutes<input type="number" min="0" max="1440" step="1" name="socialMinutes" /></label>
        <label>Unnecessary phone openings<input type="number" min="0" max="10000" step="1" name="unnecessaryOpenings" /></label>
      </fieldset>
      <div className="lab-actions">
        <button className="primary" disabled={busy || loading || !canRate}>Submit evaluation</button>
        <button type="button" disabled={busy || !history.length || !canRate} onClick={() => void requestRecommendation()}>Recommend next schedule</button>
        <span role="status">{loading ? 'Loading history…' : busy ? 'Working…' : message}</span>
      </div>
    </form>
    {error && <p className="errors" role="alert">{error}</p>}
    {suggested && <div className="recommendation">
      <h3>Recommended schedule</h3>
      <p className="lab-note">{suggested.prediction
        ? 'Predicted rating score ' + suggested.prediction.mean.toFixed(2) + ' · Expected improvement ' + suggested.prediction.improvement.toFixed(4)
        : 'This schedule explores a different part of the search space. Bayesian recommendations start after three distinct schedules have ratings.'}</p>
      <dl>{FIELDS.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{unit === 'time' ? clock(suggested.schedule[key]) : suggested.schedule[key] + unit}</dd></div>)}</dl>
      <button disabled={busy} onClick={() => { onPreview(suggested.schedule); setRecommendation(undefined) }}>Load recommendation in preview</button>
    </div>}
    {inspected && best && <>
      <div className="section-head history-heading"><h3>Evaluations for this routine</h3><button onClick={exportHistory}>Export JSON</button></div>
      <p className="lab-note">The recommendation uses the four ratings equally. Daily observations are saved for reference.</p>
      <div className="table-scroll"><table><thead><tr><th>Evaluation</th>{RATINGS.map(([name, label]) => <th key={name}>{label}</th>)}<th>Score</th><th>Inspect</th></tr></thead><tbody>
        {history.map(row => <tr key={row.id}><td>{row.id}</td>{RATINGS.map(([name]) => <td key={name}>{row.ratings[name]}</td>)}<td>{row.score.toFixed(2)}</td>
          <td><button aria-pressed={inspected.id === row.id} onClick={() => setSelected(row.id)}>Inspect {row.id}</button></td></tr>)}
      </tbody></table></div>
      <div className="recommendation">
        <h3>Evaluation {inspected.id}</h3>
        <dl>{FIELDS.map(({ key, label, unit }) => <div key={key}><dt>{label}</dt><dd>{unit === 'time' ? clock(inspected.schedule[key]) : inspected.schedule[key] + unit}</dd></div>)}</dl>
        <p className="lab-note">Social media minutes {inspected.metrics.socialMinutes ?? '—'} · Unnecessary openings {inspected.metrics.unnecessaryOpenings ?? '—'}</p>
        <button disabled={busy} onClick={() => onPreview(inspected.schedule)}>Preview evaluation</button>
        <button className="restore" disabled={busy} onClick={() => onPreview(best.schedule)}>Restore best rated schedule</button>
      </div>
    </>}
  </section>
}
