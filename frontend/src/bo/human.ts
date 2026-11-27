import type { Schedule } from '../schedule.ts'
import { CandidateSpace, integer, normalized, parameters } from './experiment.ts'
import { distance, mean, recommend } from './gp.ts'
import type { Prediction } from './gp.ts'

export const RATINGS = [
  ['calmness', 'Calmness'], ['focus', 'Perceived focus'],
  ['usability', 'Usability'], ['visualComfort', 'Visual comfort'],
] as const
export const METRICS = { socialMinutes: 1440, unnecessaryOpenings: 10000 } as const
export type Rating = typeof RATINGS[number][0]
export type Metric = keyof typeof METRICS
export type Evaluation = {
  id: number
  schedule: Schedule
  ratings: Record<Rating, number>
  metrics: Partial<Record<Metric, number>>
  score: number
}
export type Recommendation = { schedule: Schedule; prediction: Prediction | null }

export function evaluateHuman(schedule: Schedule, ratings: Record<Rating, number>, metrics: Evaluation['metrics']) {
  const validated = RATINGS.map(([rating, label]) => integer(ratings[rating], label, 1, 10))
  for (const metric of Object.keys(METRICS) as Metric[]) {
    const value = metrics[metric]
    if (value !== undefined) integer(value, metric, 0, METRICS[metric])
  }
  return { schedule, ratings, metrics, score: (mean(validated) - 1) / 9 }
}

export function recommendHuman(schedule: Schedule, history: Evaluation[]): Recommendation {
  if (!history.length) throw new Error('Submit an evaluation before requesting a recommendation.')
  const space = new CandidateSpace(schedule, 42)
  const scores = new Map<string, { point: number[]; values: number[] }>()
  for (const row of history) {
    const point = parameters(row.schedule)
    const key = point.join(',')
    const prior = scores.get(key)
    if (prior) prior.values.push(row.score)
    else scores.set(key, { point, values: [row.score] })
  }
  const pool = space.pool(new Set([...scores.keys(), parameters(schedule).join(',')]))
  const latest = [...scores.values()].slice(0, 40)
  const inputs = latest.map(({ point }) => normalized(point))
  const options = [...pool.values()].map(point => [point, normalized(point)] as const)
  if (inputs.length < 3) {
    let farthest = options[0][0]
    let separation = -Infinity
    for (const [point, coords] of options) {
      const nearest = Math.min(...inputs.map(input => distance(coords, input)))
      if (nearest > separation) {
        farthest = point
        separation = nearest
      }
    }
    return { schedule: space.schedule(farthest), prediction: null }
  }
  const { key, prediction } = recommend(inputs, latest.map(({ values }) => mean(values)), options, 0.08)
  return { schedule: space.schedule(key), prediction }
}
