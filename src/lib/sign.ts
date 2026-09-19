import { createHash, randomInt } from 'node:crypto'

/** 对最终查询串和请求体计算 DS2。
 * @param query 实际发送的查询串
 * @param body 实际发送的请求体
 * @param salt 对应端点的盐
 * @returns DS 请求头
 */
export function createDs(
  query: string,
  body: string,
  salt = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs',
): string {
  const t = Math.floor(Date.now() / 1000)
  const r = randomInt(100001, 200001)
  const hash = createHash('md5')
    .update(`salt=${salt}&t=${t}&r=${r}&b=${body}&q=${query}`)
    .digest('hex')
  return `${t},${r},${hash}`
}
