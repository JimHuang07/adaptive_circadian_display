import { Experiment } from './experiment.ts'
import type { Settings, Snapshot } from './experiment.ts'
import { recommendHuman } from './human.ts'
import type { Evaluation, Recommendation } from './human.ts'
import type { Schedule } from '../schedule.ts'

export type Commands = {
  start: { input: Settings; output: Snapshot }
  step: { input: undefined; output: Snapshot }
  recommend: { input: { schedule: Schedule; history: Evaluation[] }; output: Recommendation }
}
export type Command = {
  [K in keyof Commands]: { action: K; input: Commands[K]['input'] }
}[keyof Commands]
export type Reply = { id: number; result: Snapshot | Recommendation } | { id: number; error: string }

let experiment: Experiment | undefined
self.onmessage = ({ data }: MessageEvent<Command & { id: number }>) => {
  try {
    let result: Snapshot | Recommendation
    if (data.action === 'start') {
      experiment = new Experiment(data.input)
      result = experiment.step()
    } else if (data.action === 'step') {
      if (!experiment) throw new Error('Start a new experiment.')
      result = experiment.step()
    } else {
      result = recommendHuman(data.input.schedule, data.input.history)
    }
    self.postMessage({ id: data.id, result } satisfies Reply)
  } catch (error) {
    self.postMessage({ id: data.id, error: (error as Error).message } satisfies Reply)
  }
}
