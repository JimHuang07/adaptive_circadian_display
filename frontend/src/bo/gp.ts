export type Point = readonly number[]
export type Prediction = { mean: number; deviation: number; improvement: number }

export const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
export const mean = (values: readonly number[]) => sum(values) / values.length

export function distance(a: Point, b: Point) {
  let total = 0
  for (let i = 0; i < a.length; i++) total += (a[i] - b[i]) ** 2
  return total
}

const variance = 0.18 ** 2
const kernel = (a: Point, b: Point) => variance * Math.exp(-distance(a, b) / (2 * 0.35 ** 2))

function forwardSolve(lower: number[][], values: number[]) {
  const result: number[] = []
  for (let i = 0; i < lower.length; i++) {
    let dot = 0
    for (let j = 0; j < i; j++) dot += lower[i][j] * result[j]
    result.push((values[i] - dot) / lower[i][i])
  }
  return result
}

export class GaussianProcess {
  private readonly center: number
  private readonly lower: number[][] = []
  private readonly whitened: number[]
  private readonly inputs: Point[]

  constructor(inputs: Point[], scores: number[], noise: number) {
    this.inputs = inputs
    this.center = mean(scores)
    // Cholesky factorization on a small positive definite kernel matrix. The
    // fixed diagonal jitter matches the reference and protects duplicate inputs.
    for (let i = 0; i < inputs.length; i++) {
      const row: number[] = []
      for (let j = 0; j < i; j++) {
        const other = this.lower[j]
        let dot = 0
        for (let k = 0; k < j; k++) dot += row[k] * other[k]
        row.push((kernel(inputs[i], inputs[j]) - dot) / other[j])
      }
      const diagonal = variance + noise ** 2 + 1e-8 - sum(row.map(v => v * v))
      if (!(diagonal > 0)) throw new Error('Could not factor the Gaussian process covariance.')
      row.push(Math.sqrt(diagonal))
      this.lower.push(row)
    }
    this.whitened = forwardSolve(this.lower, scores.map(value => value - this.center))
  }

  predict(point: Point) {
    const cross = forwardSolve(this.lower, this.inputs.map(x => kernel(x, point)))
    const estimate = this.center + sum(cross.map((value, i) => value * this.whitened[i]))
    const deviation = Math.sqrt(Math.max(0, variance - sum(cross.map(v => v * v))))
    return [estimate, deviation] as const
  }
}

const density = (z: number) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI)

function normalCdf(z: number) {
  if (z <= -8.3) return 0
  if (z >= 8.3) return 1
  // Integrate the density by its converging series after factoring out exp(-z²/2).
  let term = z
  let series = term
  for (let divisor = 3; ; divisor += 2) {
    term *= z * z / divisor
    const next = series + term
    if (next === series) return Math.max(0, Math.min(1, 0.5 + density(z) * next))
    series = next
  }
}

export function recommend<Key>(
  inputs: Point[], scores: number[], candidates: Iterable<readonly [Key, Point]>, noise: number,
) {
  const gp = new GaussianProcess(inputs, scores, noise)
  const incumbent = Math.max(...inputs.map(point => gp.predict(point)[0]))
  let best: { key: Key; prediction: Prediction } | undefined
  for (const [key, point] of candidates) {
    const [estimate, deviation] = gp.predict(point)
    const gain = estimate - incumbent
    const z = gain / deviation
    const improvement = deviation < 1e-10
      ? Math.max(0, gain)
      : Math.max(0, gain * normalCdf(z) + deviation * density(z))
    if (!best || improvement > best.prediction.improvement) {
      best = { key, prediction: { mean: estimate, deviation, improvement } }
    }
  }
  if (!best) throw new Error('No feasible candidates are available.')
  return best
}
