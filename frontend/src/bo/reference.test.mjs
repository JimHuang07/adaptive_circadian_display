import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { Experiment, evaluate } from './experiment.ts'
import { GaussianProcess, recommend } from './gp.ts'
import { evaluateHuman, recommendHuman } from './human.ts'
import { PythonRandom } from './random.ts'
import { feedbackStore } from '../feedback-store.ts'
import { DEFAULTS, validate } from '../schedule.ts'

const settings = [
  { schedule: DEFAULTS, seed: 42, noise: 0.03, budget: 40, initialCount: 5, weights: [25, 25, 25, 25] },
  { schedule: { ...DEFAULTS, eveningStart: 1320, duration: 180, bed: 60 },
    seed: 2147483647, noise: 0, budget: 12, initialCount: 3, weights: [70, 5, 10, 15] },
  { schedule: { ...DEFAULTS, wake: 525, bed: 1170, morningStart: 540, eveningStart: 1140, duration: 30 },
    seed: 0, noise: 0.15, budget: 10, initialCount: 4, weights: [0, 100, 0, 0] },
]
const inputs = [[0, 0], [1, 0], [1, 0], [0.5, 0.5]]
const scores = [0.21, 0.82, 0.67, 0.44]
const candidates = [[0.2, 0.6], [0.7, 0.2], [0.95, 0], [1, 1]]
const ratings = { calmness: 6, focus: 7, usability: 8, visualComfort: 9 }
const duplicate = { ...DEFAULTS, morning: 35 }
const feedback = [DEFAULTS, duplicate, duplicate, { ...DEFAULTS, night: 25 }].map((schedule, i) => ({
  id: i + 1,
  ...evaluateHuman(schedule, { ...ratings, calmness: i + 6 }, {}),
}))

const source = `
import json, sys
from random import Random
from backend.experiment import Experiment, CandidateSpace
from backend.feedback import next_candidate
from backend.optimizer import GaussianProcess, recommend
from backend.synthetic_user import evaluate

settings, inputs, scores, candidates, history = json.load(sys.stdin)
experiments = []
for settings_row in settings:
    routine = settings_row["schedule"]
    experiment = Experiment(dict(settings_row, wake=routine["wake"], bed=routine["bed"]))
    for _ in range(experiment.budget):
        experiment.step()
    experiments.append(experiment.snapshot())

rng = Random(42)
uniforms = [rng.random() for _ in range(700)]
gaussians = [rng.gauss(0, 0.15) for _ in range(12)]
gp = GaussianProcess(inputs, scores, 0.03)
key, (ei, estimate, deviation) = recommend(inputs, scores, enumerate(candidates), 0.03)
schedule = settings[0]["schedule"]
recommendations = []
for count in (1, 4):
    space = CandidateSpace(schedule, 42)
    recommendations.append(next_candidate(space, space.parse(schedule), list(reversed(history[:count]))))
print(json.dumps(dict(experiments=experiments, uniforms=uniforms, gaussians=gaussians,
    predictions=[gp.predict(x) for x in candidates],
    acquisition=dict(key=key, prediction=dict(mean=estimate, deviation=deviation, improvement=ei)),
    synthetic=evaluate([20, 100, 0, 480, 1260, 120], [0.1, -0.1, 0.03, -0.01]),
    human=recommendations)))
`
const reference = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['-c', source], {
  cwd: fileURLToPath(new URL('../../../', import.meta.url)),
  input: JSON.stringify([settings, inputs, scores, candidates, feedback]), encoding: 'utf8',
}))

function close(actual, expected, label = 'result') {
  if (typeof expected === 'number') {
    assert.ok(Math.abs(actual - expected) <= 1e-12, label + ': ' + actual + ' differs from ' + expected)
  } else if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, label)
    expected.forEach((value, i) => close(actual[i], value, label + '[' + i + ']'))
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), label)
    for (const key of Object.keys(expected)) close(actual[key], expected[key], label + '.' + key)
  } else {
    assert.equal(actual, expected, label)
  }
}

test('seeded draws match the Python reference across MT state refreshes', () => {
  const rng = new PythonRandom(42)
  assert.deepEqual(reference.uniforms.map(() => rng.uniform()), reference.uniforms)
  close(reference.gaussians.map(() => rng.gaussian(0.15)), reference.gaussians)
})

test('GP posterior, acquisition, and synthetic objective values match Python', () => {
  const gp = new GaussianProcess(inputs, scores, 0.03)
  close(candidates.map(point => gp.predict(point)), reference.predictions)
  close(recommend(inputs, scores, candidates.entries(), 0.03), reference.acquisition)
  close(evaluate([20, 100, 0, 480, 1260, 120], [0.1, -0.1, 0.03, -0.01]), reference.synthetic)
})

test('complete synthetic experiments match Python schedules, observations, and baselines', () => {
  settings.forEach((config, i) => {
    const engine = new Experiment(config)
    for (let step = 0; step < config.budget; step++) engine.step()
    const result = engine.step()
    result.history.forEach(row => assert.deepEqual(validate(row.schedule), []))
    assert.deepEqual(result.history.map(row => row.schedule), reference.experiments[i].history.map(row => row.schedule))
    close(result, reference.experiments[i], 'experiment ' + i)
  })
})

test('human exploration and acquired recommendations match Python', () => {
  for (const [index, count] of [1, 4].entries()) {
    const result = recommendHuman(DEFAULTS, feedback.slice(0, count).reverse())
    assert.deepEqual(result.schedule, reference.human[index].schedule)
    close(result, reference.human[index])
  }
})

test('feedback can be reloaded from storage and is isolated by routine and application path', () => {
  const entries = new Map()
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
  const first = feedbackStore(storage, '/repo/').submit(DEFAULTS, ratings, { socialMinutes: 0 })
  const reloaded = feedbackStore(storage, '/repo/')
  assert.deepEqual(reloaded.history(DEFAULTS), first)
  assert.equal(first[0].metrics.socialMinutes, 0)
  assert.deepEqual(reloaded.history({ ...DEFAULTS, wake: 419 }), [])
  assert.deepEqual(feedbackStore(storage, '/other/').history(DEFAULTS), [])
  assert.throws(() => reloaded.submit(DEFAULTS, { ...ratings, focus: 11 }, {}), /Perceived focus/)
  assert.deepEqual(reloaded.history(DEFAULTS), first)
})
