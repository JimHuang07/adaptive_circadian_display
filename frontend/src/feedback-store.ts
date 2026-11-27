import type { Schedule } from './schedule.ts'
import { DEFAULTS, validate } from './schedule.ts'
import { evaluateHuman } from './bo/human.ts'
import type { Evaluation } from './bo/human.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function feedbackStore(storage: Store, base: string) {
  function key(schedule: Schedule) {
    return 'adaptive-circadian:' + base + ':feedback:v1:' + schedule.wake + ':' + schedule.bed
  }

  function history(schedule: Schedule): Evaluation[] {
    const data = storage.getItem(key(schedule))
    if (data === null) return []
    const rows: unknown = JSON.parse(data)
    if (!Array.isArray(rows)) throw new Error('Saved feedback could not be read.')
    return rows
  }

  function submit(schedule: Schedule, ratings: Evaluation['ratings'], metrics: Evaluation['metrics']) {
    const evaluation = evaluateHuman(schedule, ratings, metrics)
    const rows = history(schedule)
    const updated = [{ ...evaluation, id: (rows[0]?.id ?? 0) + 1 }, ...rows]
    storage.setItem(key(schedule), JSON.stringify(updated))
    return updated
  }

  return { key, history, submit }
}

const scheduleKey = (base: string) => 'adaptive-circadian:' + base + ':schedule:v1'

export function loadSchedule(storage: Store, base: string): Schedule {
  const raw = storage.getItem(scheduleKey(base))
  if (raw === null) return DEFAULTS
  const schedule = JSON.parse(raw) as Schedule | null
  return schedule && !validate(schedule).length ? schedule : DEFAULTS
}

export function saveSchedule(storage: Store, base: string, schedule: Schedule) {
  storage.setItem(scheduleKey(base), JSON.stringify(schedule))
}
