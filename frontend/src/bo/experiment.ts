import { bedtime, FIELDS, validate, WAKE_RAMP } from '../schedule.ts'
import type { Schedule } from '../schedule.ts'
import { recommend, sum } from './gp.ts'
import type { Prediction } from './gp.ts'
import { PythonRandom } from './random.ts'

export const OBJECTIVES = ['distraction', 'calmness', 'productivity', 'usability'] as const
export type Observation = {
  iteration: number
  schedule: Schedule
  objectives: Record<typeof OBJECTIVES[number], number>
  score: number
  prediction: Prediction | null
}
export type Snapshot = { budget: number; history: Observation[]; baseline: { iteration: number; score: number }[] }
export type Settings = { schedule: Schedule; seed: number; noise: number; budget: number; initialCount: number; weights: number[] }

const PRIMES = [2, 3, 5, 7, 11, 13]
const key = (point: readonly number[]) => point.join(',')
export const parameters = (schedule: Schedule) => FIELDS.map(({ key }) => schedule[key])
export const normalized = (point: readonly number[]) => FIELDS.map(({ min, max }, i) => (point[i] - min) / (max - min))

export function integer(value: number, name: string, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(name + ' must be an integer from ' + min + ' to ' + max + '.')
  }
  return value
}

function radicalInverse(index: number, base: number) {
  let result = 0
  let scale = 1 / base
  while (index > 0) {
    result += (index % base) * scale
    index = Math.floor(index / base)
    scale /= base
  }
  return result
}

const snap = (value: number, min: number, max: number) => min + Math.floor(value * (max - min + 1))

export class CandidateSpace {
  private readonly end: number
  private readonly shifts: number[]
  private readonly routine: Schedule
  private index = 1

  constructor(routine: Schedule, seed: number) {
    const errors = validate(routine)
    if (errors.length) throw new Error(errors[0].message)
    this.routine = routine
    this.end = bedtime(routine)
    this.shifts = PRIMES.map((_, i) => new PythonRandom(seed + 3 + i).uniform())
  }

  feasible(u: number[]) {
    const duration = snap(u[5], 30, Math.min(180, this.end - 1140))
    return [
      snap(u[0], 0, 60), snap(u[1], 60, 100), snap(u[2], 0, 40),
      snap(u[3], Math.max(420, this.routine.wake + WAKE_RAMP), 540),
      snap(u[4], 1140, Math.min(1320, this.end - duration)), duration,
    ]
  }

  sample() {
    const index = this.index++
    return this.feasible(PRIMES.map((prime, i) => (radicalInverse(index, prime) + this.shifts[i]) % 1))
  }

  schedule(point: readonly number[]): Schedule {
    const schedule = { ...this.routine }
    FIELDS.forEach(({ key }, i) => { schedule[key] = point[i] })
    return schedule
  }

  pool(excluded: Set<string>) {
    const candidates = new Map<string, number[]>()
    while (candidates.size < 256) {
      const point = this.sample()
      const id = key(point)
      if (!excluded.has(id)) candidates.set(id, point)
    }
    return candidates
  }
}

export function evaluate(candidate: number[], noise: number[]): Observation['objectives'] {
  const [m, d, n, a, e, r] = normalized(candidate)
  const values = [
    0.10 + 0.28*m + 0.25*n + 0.22*e*n + 0.13*d,
    0.87 - 0.50*(m - 0.24)**2 - 0.33*n - 0.20*(e + r - 0.9)**2 + 0.07*Math.cos(4*Math.PI*r),
    0.92 - 0.50*(d - 0.75)**2 - 0.38*(a + r - 0.72)**2 + 0.07*Math.cos(4*Math.PI*a),
    0.53 + 0.22*d + 0.15*n + 0.08*m + 0.13*Math.exp(-12*(r - 0.45)**2),
  ]
  const [distraction, calmness, productivity, usability] = values.map((value, i) => Math.min(1, Math.max(0, value + noise[i])))
  return { distraction, calmness, productivity, usability }
}

export class Experiment {
  private readonly space: CandidateSpace
  private readonly gaussian: PythonRandom
  private readonly random: PythonRandom
  private readonly weights: number[]
  private readonly initial: number[][]
  private readonly history: Observation[] = []
  private readonly baseline: Snapshot['baseline'] = []
  private readonly boSeen = new Set<string>()
  private readonly randomSeen = new Set<string>()
  private readonly settings: Settings

  constructor(settings: Settings) {
    this.settings = settings
    const { schedule, budget, initialCount, noise, seed, weights } = settings
    integer(seed, 'Seed', 0, 2147483647)
    integer(budget, 'Evaluation budget', 4, 40)
    integer(initialCount, 'Initial samples', 3, Math.min(10, budget - 1))
    if (!(noise >= 0 && noise <= 0.15)) throw new Error('Noise must be between 0 and 0.15.')
    const total = sum(weights)
    if (weights.length !== 4 || !(total > 0) || weights.some(w => !(w >= 0 && w <= 100))) {
      throw new Error('Provide four weights between 0 and 100 with a positive sum.')
    }
    this.weights = weights.map(w => w / total)
    this.space = new CandidateSpace(schedule, seed)
    this.gaussian = new PythonRandom(seed + 1)
    this.random = new PythonRandom(seed + 2)
    this.initial = [parameters(schedule)]
    const seen = new Set([key(this.initial[0])])
    while (this.initial.length < initialCount) {
      const point = this.space.sample()
      if (!seen.has(key(point))) {
        seen.add(key(point))
        this.initial.push(point)
      }
    }
  }

  private observe(candidate: number[], noise: number[], iteration: number, prediction: Prediction | null): Observation {
    const objectives = evaluate(candidate, noise)
    const score = sum(OBJECTIVES.map((objective, i) => this.weights[i] * objectives[objective] * (i === 0 ? -1 : 1)))
    return { iteration, schedule: this.space.schedule(candidate), objectives, score, prediction }
  }

  step() {
    const index = this.history.length
    if (index >= this.settings.budget) return this.snapshot()
    let candidate = this.initial[index]
    let baseline = candidate
    let prediction: Prediction | null = null
    if (!candidate) {
      const pool = this.space.pool(this.boSeen)
      const result = recommend(
        this.history.map(row => normalized(parameters(row.schedule))),
        this.history.map(row => row.score),
        [...pool.values()].map(point => [point, normalized(point)] as const),
        this.settings.noise * Math.sqrt(sum(this.weights.map(w => w * w))),
      )
      candidate = result.key
      prediction = result.prediction
      do {
        baseline = this.space.feasible(FIELDS.map(() => this.random.uniform()))
      } while (this.randomSeen.has(key(baseline)))
    }
    const noise = OBJECTIVES.map(() => this.gaussian.gaussian(this.settings.noise))
    const iteration = index + 1
    this.history.push(this.observe(candidate, noise, iteration, prediction))
    this.baseline.push({ iteration, score: this.observe(baseline, noise, iteration, null).score })
    this.boSeen.add(key(candidate))
    this.randomSeen.add(key(baseline))
    return this.snapshot()
  }

  snapshot(): Snapshot {
    return { budget: this.settings.budget, history: [...this.history], baseline: [...this.baseline] }
  }
}
