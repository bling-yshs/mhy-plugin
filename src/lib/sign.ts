import { createHash, randomInt } from 'node:crypto'

/** 生成游戏签到使用的 DS1，协议沿用 GT-Manual。
 * @returns 签到 DS 请求头
 */
export function createSignDs(): string {
  const t = Math.floor(Date.now() / 1000)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < 6; i++) r += chars[randomInt(chars.length)]
  const hash = createHash('md5').update(`salt=jEpJb9rRARU2rXDA9qYbZ3selxkuct9a&t=${t}&r=${r}`).digest('hex')
  return `${t},${r},${hash}`
}

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
