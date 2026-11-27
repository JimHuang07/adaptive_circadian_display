export const DAY = 1440
export const WAKE_RAMP = 15
export const DEFAULT_TIME = 510
export const DEFAULTS = { morning: 20, daytime: 100, night: 0, morningStart: 480, eveningStart: 1260, duration: 120, wake: 420, bed: 1380 }
export type Schedule = typeof DEFAULTS
export const PRESETS = ['Adaptive Saturation', 'Full Color', 'Always Grayscale', 'Fixed Bedtime Grayscale'] as const
export type Preset = typeof PRESETS[number]
export const FIELDS = [
  { key: 'morning', label: 'Morning saturation', min: 0, max: 60, unit: '%', hint: 'Color during morning calm' },
  { key: 'daytime', label: 'Daytime saturation', min: 60, max: 100, unit: '%', hint: 'Color during productive hours' },
  { key: 'night', label: 'Nighttime saturation', min: 0, max: 40, unit: '%', hint: 'Color after the evening ramp' },
  { key: 'morningStart', label: 'Morning transition', min: 420, max: 540, unit: 'time', hint: 'When color begins to increase' },
  { key: 'eveningStart', label: 'Evening transition', min: 1140, max: 1320, unit: 'time', hint: 'When color begins to decrease' },
  { key: 'duration', label: 'Transition duration', min: 30, max: 180, unit: ' min', hint: 'Length of both daily ramps' },
] as const
export const clock = (minute: number) => {
  const wrapped = Math.floor(minute) % DAY
  return [Math.floor(wrapped / 60), wrapped % 60].map(n => String(n).padStart(2, '0')).join(':')
}
export const bedtime = (s: Schedule) => s.bed < s.wake ? s.bed + DAY : s.bed

export function validate(s: Schedule) {
  const errors: { keys: (keyof Schedule)[]; message: string }[] = []
  for (const { key, label, min, max } of FIELDS) {
    if (!Number.isInteger(s[key]) || s[key] < min || s[key] > max) errors.push({ keys: [key], message: label + ' is outside its allowed range.' })
  }
  for (const key of ['wake', 'bed'] as const) {
    if (!Number.isInteger(s[key]) || s[key] < 0 || s[key] >= DAY) errors.push({ keys: [key], message: 'Enter a valid wake-up time and bedtime.' })
  }
  if (s.wake + WAKE_RAMP > s.morningStart) errors.push({ keys: ['wake', 'morningStart'], message: 'Allow 15 minutes between wake-up and the morning transition.' })
  if (s.morningStart + s.duration > s.eveningStart) errors.push({ keys: ['morningStart', 'duration', 'eveningStart'], message: 'The morning transition must finish before the evening transition starts.' })
  if (s.eveningStart + s.duration > bedtime(s)) errors.push({ keys: ['eveningStart', 'duration', 'bed'], message: 'The evening transition must finish by bedtime.' })
  return errors
}

export function phases(s: Schedule) {
  return [
    { start: 0, label: 'Sleep', color: '#eeedf7' },
    { start: s.wake, label: 'Morning calm', color: '#fff3df' },
    { start: s.morningStart, label: 'Morning transition', color: '#f9ebd6' },
    { start: s.morningStart + s.duration, label: 'Productive hours', color: '#edf4ff' },
    { start: s.eveningStart, label: 'Evening transition', color: '#f9eadf' },
    { start: s.eveningStart + s.duration, label: 'Wind-down', color: '#f1edf7' },
    { start: bedtime(s), label: 'Sleep', color: '#eeedf7' },
  ]
}

export function phaseAt(s: Schedule, t: number) {
  const previousBed = bedtime(s) - DAY
  if (previousBed > t && t < s.wake) t += DAY
  return phases(s).filter(phase => phase.start <= t).at(-1)?.label ?? 'Sleep'
}

export function saturation(s: Schedule, t: number, preset: Preset = PRESETS[0]): number {
  if (preset === 'Full Color') return 100
  if (preset === 'Always Grayscale') return 0
  if (preset === 'Fixed Bedtime Grayscale') {
    if (t < s.wake) return t < bedtime(s) - DAY ? 100 : 0
    return t >= bedtime(s) ? 0 : 100
  }
  const ramp = (from: number, to: number, elapsed: number, duration: number) => from + (to - from) * elapsed / duration
  if (t < s.wake && t + DAY < s.eveningStart + s.duration) t += DAY
  if (t < s.wake) return s.night
  if (t < s.wake + WAKE_RAMP) return ramp(s.night, s.morning, t - s.wake, WAKE_RAMP)
  if (t < s.morningStart) return s.morning
  if (t < s.morningStart + s.duration) return ramp(s.morning, s.daytime, t - s.morningStart, s.duration)
  if (t < s.eveningStart) return s.daytime
  if (t < s.eveningStart + s.duration) return ramp(s.daytime, s.night, t - s.eveningStart, s.duration)
  return s.night
}

export function randomSchedule(s: Schedule): Schedule {
  const pick = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
  const latestBed = bedtime(s)
  const duration = pick(30, Math.min(180, latestBed - 1140))
  return {
    ...s, duration, morning: pick(0, 60), daytime: pick(60, 100), night: pick(0, 40),
    morningStart: pick(Math.max(420, s.wake + WAKE_RAMP), 540),
    eveningStart: pick(1140, Math.min(1320, latestBed - duration)),
  }
}
