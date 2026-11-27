import type { Commands, Reply } from './worker.ts'

type Result = Commands[keyof Commands]['output']
let worker: Worker | undefined
let sequence = 0
const pending = new Map<number, { resolve: (value: Result) => void; reject: (error: Error) => void }>()

function getWorker() {
  if (worker) return worker
  const instance = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  instance.onmessage = ({ data }: MessageEvent<Reply>) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    if ('error' in data) request.reject(new Error(data.error))
    else request.resolve(data.result)
  }
  instance.onerror = () => {
    instance.terminate()
    worker = undefined
    for (const request of pending.values()) {
      request.reject(new Error('The optimizer worker stopped. Start a new experiment and try again.'))
    }
    pending.clear()
  }
  worker = instance
  return instance
}

export async function compute<K extends keyof Commands>(action: K, input: Commands[K]['input']): Promise<Commands[K]['output']> {
  const instance = getWorker()
  return new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve: value => resolve(value as Commands[K]['output']), reject })
    try {
      instance.postMessage({ id, action, input })
    } catch (error) {
      pending.delete(id)
      reject(error)
    }
  })
}
