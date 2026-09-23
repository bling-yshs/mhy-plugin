import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import config from './config.js'

const HISTORY_DIRECTORY = new URL('../../fetch-history/', import.meta.url)

/**
 * 按原生 fetch 的方式发送请求，开启 debug 时异步记录请求和响应。
 * @param input 请求地址或 Request 对象
 * @param init 原生 fetch 请求选项
 * @param forceHistory 强制记录本次请求并等待记录完成
 * @returns 原生 Response 对象；请求失败时抛出原始异常
 */
export default async function fetch(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
  forceHistory = false,
): Promise<Response> {
  if (!config.debug && !forceHistory) return globalThis.fetch(input, init)

  const startedAt = Date.now()
  const time = new Date(startedAt + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00')
  const request = new Request(input, init)
  const url = new URL(request.url)
  const name = (url.pathname.split('/').filter(Boolean).pop() || url.hostname)
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .slice(0, 80)
  const filename = `${time.slice(0, -6).replace(/:/g, '-')}_${name}_${randomUUID()}.json`
  const requestBody = request.clone().text().catch(String)

  /**
   * 保存本次请求日志，日志读取或写入失败时输出警告。
   * @param response 请求成功时的响应副本
   * @param error 请求失败时的异常详情
   * @returns 历史记录是否保存成功
   */
  async function saveHistory(response?: Response, error?: string): Promise<boolean> {
    const durationMs = Date.now() - startedAt
    try {
      const responseBody = response ? await response.text().catch(String) : null
      const history = {
        time,
        durationMs,
        request: {
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers),
          params: [...url.searchParams],
          body: await requestBody,
        },
        response: response
          ? {
              url: response.url,
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers),
              body: responseBody,
            }
          : null,
        error: error ?? null,
      }
      await mkdir(HISTORY_DIRECTORY, { recursive: true })
      await writeFile(new URL(filename, HISTORY_DIRECTORY), JSON.stringify(history, null, 2), 'utf8')
      return true
    } catch (logError) {
      console.warn('[mhy-plugin] fetch 日志保存失败', logError)
      return false
    }
  }

  let response: Response
  try {
    response = await globalThis.fetch(request, { ...init, body: undefined })
  } catch (error) {
    const history = saveHistory(
      undefined,
      error instanceof Error ? error.stack || error.message : String(error),
    )
    if (forceHistory) await history
    throw error
  }

  try {
    const history = saveHistory(response.clone())
    if (forceHistory && !(await history)) throw new Error('HTTP 历史记录写入失败')
  } catch (error) {
    if (forceHistory) throw error
    console.warn('[mhy-plugin] fetch 响应日志读取失败', error)
  }
  return response
}
