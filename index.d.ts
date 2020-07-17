import { ChildProcess, SpawnOptions } from 'child_process'

interface LaunchOptions {
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

interface LaunchProcess {
  restart(): void
  kill(signal?: number): void
}

declare const launch: (opts: LaunchOptions) => LaunchProcess

export = launch
