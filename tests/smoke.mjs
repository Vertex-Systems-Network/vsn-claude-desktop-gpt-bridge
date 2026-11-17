import { spawnSync } from 'node:child_process'
import electron from 'electron'

const env = { ...process.env }
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE
const result = spawnSync(electron, ['.', '--deskagent-smoke'], {
  env, encoding: 'utf8', timeout: 40_000, windowsHide: true,
})
if (result.error) throw result.error
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
if (result.status !== 0 || !result.stdout?.includes('DeskAgent Windows startup, sandboxed IPC and DPAPI verified')) {
  process.exitCode = 1
}
