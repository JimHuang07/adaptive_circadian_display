import { useEffect, useRef, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { clock, FIELDS } from './schedule'
import type { Schedule } from './schedule'
import { compute } from './bo/client'
import { OBJECTIVES } from './bo/experiment'
import type { Observation, Snapshot } from './bo/experiment'

export function Optimization({ schedule, onPreview }: { schedule: Schedule; onPreview: (s: Schedule) => void }) {
  const [experiment, setExperiment] = useState<Snapshot>()
  const [selected, setSelected] = useState<number>()
  const [budget, setBudget] = useState('20')
  const [initialCount, setInitialCount] = useState('5')
  const [seed, setSeed] = useState('42')
  const [noise, setNoise] = useState('0.03')
  const [weights, setWeights] = useState(['25', '25', '25', '25'])
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const history = experiment?.history ?? []
  const current = history.at(-1)
  const best = history.reduce<Observation | undefined>((winner, row) => !winner || row.score > winner.score ? row : winner, undefined)
  const inspected = history.find(row => row.iteration === selected) ?? current
  const complete = !!experiment && history.length >= experiment.budget
  let boBest = -Infinity
  let randomBest = -Infinity
  const curve = history.map((row, i) => {
    boBest = Math.max(boBest, row.score)
    randomBest = Math.max(randomBest, experiment!.baseline[i].score)
    return { iteration: row.iteration, observed: row.score, boBest, randomBest }
  })

  useEffect(() => () => { active.current = false }, [])

  async function act(automatic: boolean, restart = false) {
    setError('')
    setBusy(true)
    setRunning(automatic)
    active.current = automatic
    try {
      let state = restart ? undefined : experiment
      if (!state) {
        state = await compute('start', {
          schedule, seed: Number(seed), noise: Number(noise),
          budget: Number(budget), initialCount: Number(initialCount), weights: weights.map(Number),
        })
        setExperiment(state)
        setSelected(undefined)
        if (!automatic) return
      }
      while (state.history.length < state.budget && (!automatic || active.current)) {
        state = await compute('step', undefined)
        setExperiment(state)
        if (!automatic) break
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to contact the local optimizer.')
    } finally {
      active.current = false
      setRunning(false)
      setBusy(false)
    }
  }

  function stop() {
    active.current = false
    setRunning(false)
  }

  return <section className="card optimization" aria-labelledby="optimization-title">
    <div className="section-head"><h2 id="optimization-title">Bayesian optimization lab</h2><span className="status">Synthetic student profile</span></div>
    <p className="lab-note">Simulated scores come from a fictional user. Each experiment fixes the wake-up and bedtime from the starting schedule.</p>
    <form onSubmit={event => { event.preventDefault(); void act(false, true) }}>
      <fieldset disabled={busy} className="lab-settings">
        <legend>New experiment settings</legend>
        <label>Evaluation budget<input type="number" min="4" max="40" required value={budget} onChange={e => setBudget(e.target.value)} /></label>
        <label>Initial samples<input type="number" min="3" max={Math.min(10, Number(budget) - 1)} required value={initialCount} onChange={e => setInitialCount(e.target.value)} /></label>
        <label>Seed<input type="number" min="0" max="2147483647" required value={seed} onChange={e => setSeed(e.target.value)} /></label>
        <label>Score noise (SD)<input type="number" min="0" max="0.15" step="0.01" required value={noise} onChange={e => setNoise(e.target.value)} /></label>
      </fieldset>
      <fieldset disabled={busy} className="lab-settings">
        <legend>Objective weights</legend>
        {OBJECTIVES.map((objective, index) => <label key={objective}>{objective}<input type="number" min="0" max="100" required value={weights[index]} onChange={e => setWeights(weights.map((w, i) => i === index ? e.target.value : w))} /></label>)}
      </fieldset>
      <div className="lab-actions">
        <button className="primary" type="submit" disabled={busy}>Start new experiment</button>
        <button type="button" disabled={busy || complete || !experiment} onClick={() => void act(false)}>Step</button>
        <button type="button" disabled={busy || complete || !experiment} onClick={() => void act(true)}>Run</button>
        <button type="button" disabled={!running} onClick={stop}>Stop</button>
        {experiment && <span role="status">{history.length} / {experiment.budget} evaluations{complete ? ' Â· Complete' : busy ? ' Â· Evaluating' : ''}</span>}
      </div>
    </form>
    {error && <p className="errors" role="alert">{error}</p>}
    {current && inspected && best && <>
      <div className="lab-grid">
        <div>
          <h3>Convergence</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve}>
                <CartesianGrid vertical={false} strokeDasharray="3 4" />
                <XAxis dataKey="iteration" allowDecimals={false} />
                <YAxis width={50} tickFormatter={x => Number(x).toFixed(2)} domain={['auto', 'auto']} />
                <Tooltip formatter={v => Number(v).toFixed(3)} />
                <Legend />
                <Line dataKey="observed" name="BO observed" stroke="#9990ba" isAnimationActive={false} dot={{ r: 2 }} />
                <Line dataKey="boBest" name="BO best" stroke="#6451cf" strokeWidth={2} isAnimationActive={false} dot={false} />
                <Line dataKey="randomBest" name="Random best" stroke="#237d78" strokeWidth={2} strokeDasharray="5 4" isAnimationActive={false} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="lab-note">BO and random search share initial observations, evaluation budget, and noise draws.</p>
        </div>
        <div>
          <h3>Evaluation {inspected.iteration} scores</h3>
          {OBJECTIVES.map(key => <div className="score" key={key}>
            <label htmlFor={'score-' + key}>{key}{key === 'distraction' ? ' â†“' : ' â†‘'}</label>
            <meter id={'score-' + key} min={0} max={1} value={inspected.objectives[key]} />
            <span>{inspected.objectives[key].toFixed(2)}</span>
          </div>)}
          <p className="lab-note">Weighted utility {inspected.score.toFixed(3)}</p>
          <p className="lab-note">{inspected.prediction
            ? 'GP prediction ' + inspected.prediction.mean.toFixed(3) + ' Â· SD ' + inspected.prediction.deviation.toFixed(3) + ' Â· Expected improvement ' + inspected.prediction.improvement.toFixed(4)
            : inspected.iteration === 1 ? 'Starting schedule from the preview.' : 'Initial space-filling sample.'}</p>
          <button onClick={() => onPreview(inspected.schedule)}>Preview evaluation</button>
          <button className="restore" onClick={() => onPreview(best.schedule)}>Restore best schedule</button>
        </div>
      </div>
      <h3>Candidate comparison</h3>
      <div className="table-scroll"><table><thead><tr><th>Parameter</th><th>Initial</th><th>Current</th><th>Best observed</th></tr></thead><tbody>
        {FIELDS.map(({ key, label, unit }) => <tr key={key}><th scope="row">{label}</th>
          {[history[0], current, best].map((row, column) => <td key={column}>{unit === 'time' ? clock(row.schedule[key]) : row.schedule[key] + unit}</td>)}
        </tr>)}
      </tbody></table></div>
      <h3>Optimization history</h3>
      <div className="table-scroll"><table><thead><tr><th>Evaluation</th><th>Method</th><th>Utility</th><th>Inspect</th></tr></thead><tbody>
        {history.map(row => <tr key={row.iteration}><td>{row.iteration}</td><td>{row.prediction ? 'Expected improvement' : row.iteration === 1 ? 'Starting schedule' : 'Space-filling'}</td><td>{row.score.toFixed(3)}</td>
          <td><button aria-pressed={inspected.iteration === row.iteration} onClick={() => setSelected(row.iteration)}>Inspect {row.iteration}</button></td>
        </tr>)}
      </tbody></table></div>
    </>}
  </section>
}
