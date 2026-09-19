import fs from 'node:fs/promises'

const appsDir = new URL('./dist/apps/', import.meta.url)
const apps = {}

let files = []
try {
  files = (await fs.readdir(appsDir)).filter((file) => file.endsWith('.js'))
} catch (error) {
  const log = globalThis.logger ?? console
  log.error?.('[mhy-plugin] 未找到 dist/apps，请先执行 pnpm build')
  log.error?.(error)
}

const results = await Promise.allSettled(
  files.map((file) => import(new URL(file, appsDir).href)),
)

for (let i = 0; i < files.length; i += 1) {
  const file = files[i]
  const name = file.replace(/\.js$/, '')
  const result = results[i]

  if (result.status !== 'fulfilled') {
    const log = globalThis.logger ?? console
    log.error?.(`[mhy-plugin] 载入模块 ${name} 失败`)
    log.error?.(result.reason)
    continue
  }

  const pluginClass = Object.values(result.value).find((value) => typeof value === 'function')
  if (pluginClass) apps[name] = pluginClass
}

export { apps }
