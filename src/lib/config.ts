import { copyFileSync, existsSync, mkdirSync, readFileSync, watchFile } from 'node:fs'
import YAML from 'yaml'

const DEFAULT_CONFIG_FILE = new URL('../../default-config/main.yaml', import.meta.url)
const CONFIG_DIRECTORY = new URL('../../config/', import.meta.url)
const CONFIG_FILE = new URL('./main.yaml', CONFIG_DIRECTORY)

export type MhyPluginConfig = {
  debug: boolean
}

type PartialMhyPluginConfig = Partial<MhyPluginConfig>

/**
 * 确保用户配置文件存在。
 * @returns {void}
 */
function ensureConfigFile(): void {
  if (existsSync(CONFIG_FILE)) return

  mkdirSync(CONFIG_DIRECTORY, { recursive: true })
  copyFileSync(DEFAULT_CONFIG_FILE, CONFIG_FILE)
}

/**
 * 读取单个 YAML 配置文件。
 * @param {URL} file 配置文件路径
 * @returns {PartialMhyPluginConfig} 配置内容
 */
function readConfigFile(file: URL): PartialMhyPluginConfig {
  const parsed = YAML.parse(readFileSync(file, 'utf8')) as PartialMhyPluginConfig | null
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`配置文件必须是 YAML 对象：${file.pathname}`)
  }
  if ('debug' in parsed && typeof parsed.debug !== 'boolean') {
    throw new Error(`配置 debug 必须是布尔值：${file.pathname}`)
  }

  return parsed
}

/**
 * 读取并校验默认配置和用户配置，用户配置优先。
 * @returns {MhyPluginConfig} 完整的有效配置
 */
function loadConfig(): MhyPluginConfig {
  return {
    debug: false,
    ...readConfigFile(DEFAULT_CONFIG_FILE),
    ...readConfigFile(CONFIG_FILE),
  }
}

ensureConfigFile()

const config: MhyPluginConfig = loadConfig()

/**
 * 重新加载配置并原地更新导出对象，读取或校验失败时保留旧配置。
 * @returns {void}
 */
function reloadConfig(): void {
  try {
    Object.assign(config, loadConfig())
  } catch (error) {
    console.warn('[mhy-plugin] 配置热更新失败，保留上一次有效配置', error)
  }
}

for (const file of [DEFAULT_CONFIG_FILE, CONFIG_FILE]) {
  watchFile(file, { interval: 1000, persistent: false }, reloadConfig)
}

export default config
