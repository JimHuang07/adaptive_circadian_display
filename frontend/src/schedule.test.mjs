import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULTS, DAY, phaseAt, randomSchedule, saturation, validate } from './schedule.ts'

test('default schedule interpolates through all three ramps', () => {
  assert.deepEqual(validate(DEFAULTS), [])
  for (const [time, expected] of [[0,0],[420,0],[427.5,10],[435,20],[480,20],[510,40],[600,100],[1320,50],[1380,0],[DAY,0]]) {
    assert.equal(saturation(DEFAULTS, time), expected)
  }
  assert.equal(phaseAt(DEFAULTS, 480), 'Morning transition')
  assert.equal(phaseAt(DEFAULTS, 600), 'Productive hours')
  assert.equal(phaseAt(DEFAULTS, 1380), 'Sleep')
})

test('conflicting times report the associated inputs', () => {
  assert.deepEqual(validate({ ...DEFAULTS, wake: 470 })[0].keys, ['wake', 'morningStart'])
  assert.deepEqual(validate({ ...DEFAULTS, bed: 1320 })[0].keys, ['eveningStart', 'duration', 'bed'])
})

test('overnight bedtime supports ramps spanning midnight', () => {
  const overnight = { ...DEFAULTS, eveningStart: 1320, duration: 180, bed: 60 }
  assert.deepEqual(validate(overnight), [])
  assert.equal(saturation(overnight, 0), saturation(overnight, DAY))
  assert.ok(Math.abs(saturation(overnight, 0) - 100 / 3) < 1e-10)
  assert.equal(saturation(overnight, 60), 0)
  assert.equal(phaseAt(overnight, 30), 'Evening transition')
  assert.equal(phaseAt(overnight, 60), 'Sleep')
  assert.equal(saturation(overnight, 59, 'Fixed Bedtime Grayscale'), 100)
  assert.equal(saturation(overnight, 60, 'Fixed Bedtime Grayscale'), 0)
})

test('randomized schedules preserve the routine and fit its constraints', () => {
  const routine = { ...DEFAULTS, wake: 525, morningStart: 540, bed: 1170, eveningStart: 1140, duration: 30 }
  for (let count = 0; count < 100; count++) {
    const next = randomSchedule(routine)
    assert.deepEqual(validate(next), [])
    assert.equal(next.wake, routine.wake)
    assert.equal(next.bed, routine.bed)
  }
})
