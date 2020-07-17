import { ChildProcess, SpawnOptions } from 'child_process'

export interface LaunchOptions {
  main: string
  command?: string
  commandOptions?: ReadonlyArray<string>
  args?: ReadonlyArray<string>
  spawnOptions?: SpawnOptions
  onChildSpawned?: (child: ChildProcess) => void
  ignore?: RegExp
  usePolling?: boolean
  interval?: number
  binaryInterval?: number
  includeModules?: boolean
  killSignal?: string
  killTimeout?: number
  deleteRequireCache?: ReadonlyArray<string>
  restartOnError?: boolean
  restartOnExit?: boolean
}

export interface LaunchProcess {
  restart(): void
  kill(signal?: number): void
}

export default function launch(opts: LaunchOptions): LaunchProcess
