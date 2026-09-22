import { AutoSignSettingDB, MysUserDB, SignRecordDB, UserDB, writeTransaction } from '../db/index.js'
import { getAccounts } from './accounts.js'
import { getServer, request } from './request.js'
import type { ApiResponse, Game, JsonValue } from '../types/api.js'

const running = new Set<string>()
const gameNames = { gs: '原神', sr: '星铁', zzz: '绝区零' }

/** 返回北京时间的日期和时分。
 * @returns 日期及 HH:mm 时间
 */
export function signClock(): { date: string; time: string } {
  const iso = new Date(Date.now() + 8 * 3600000).toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
}

/** 设置发送者关联账号的对应游戏签到开关。
 * @param userId 发送者 ID
 * @param game 游戏
 * @param enabled 是否开启
 * @returns 更新的米游社账号 ID
 */
export async function setAutoSign(userId: string, game: Game, enabled: boolean): Promise<string[]> {
  const accounts = (await getAccounts(userId)).filter(account => account.uids[game]?.length)
  if (!accounts.length) throw new Error(`请先绑定${gameNames[game]}的米游社账号`)
  await writeTransaction(async transaction => {
    for (const account of accounts) {
      await AutoSignSettingDB.upsert({ ltuid: String(account.ltuid), game, enabled }, { transaction })
    }
  })
  return accounts.map(account => String(account.ltuid))
}

/** 为一个角色执行签到；自动任务遇到当天任意记录即跳过。
 * @param ltuid 米游社账号 ID
 * @param game 游戏
 * @param uid 游戏角色 UID
 * @param manual 是否用户手动触发
 * @returns 面向用户的签到结果
 */
export async function signRole(ltuid: string, game: Game, uid: string, manual: boolean): Promise<string> {
  const region = getServer(uid, game)
  const where = { game, region, uid, sign_date: signClock().date }
  const key = JSON.stringify(where)
  const label = `${gameNames[game]} ${uid}`
  if (running.has(key)) return `${label}：签到正在执行`
  running.add(key)
  try {
    const record = await writeTransaction(async transaction => {
      const existing = await SignRecordDB.findOne({ where, transaction })
      if (existing && !manual) return null
      if (existing) {
        await existing.update({ ltuid, status: 'running', result: null }, { transaction })
        return existing
      }
      return SignRecordDB.create({ ...where, ltuid, status: 'running' }, { transaction })
    })
    if (!record) return `${label}：今天已执行自动签到`
    const result: Record<string, JsonValue | ApiResponse> = {}
    let message = ''
    try {
      const account = await MysUserDB.findByPk(ltuid)
      if (!account?.ck || !account.uids[game]?.includes(uid)) throw new Error('账号或角色绑定已变更，请重新绑定')
      const context = { game, uid, accountId: ltuid, server: region }
      const info = await request('bbs_sign_info', context, {})
      result.info = info
      if (info.retcode !== 0) throw new Error(info.message || `签到状态查询失败：${info.retcode}`)
      if (typeof info.data?.is_sign !== 'boolean' || typeof info.data.total_sign_day !== 'number')
        throw new Error('签到状态响应缺少 is_sign 或 total_sign_day')
      let days = info.data.total_sign_day
      if (info.data.is_sign) {
        record.status = 'already_signed'
        message = '今天已签到'
      } else {
        const sign = await request('bbs_sign', context, {})
        result.sign = sign
        if (sign.retcode === -5003) {
          record.status = 'already_signed'
          message = '今天已签到'
          days += 1
        } else {
          if (sign.retcode !== 0) throw new Error(sign.message || `签到失败：${sign.retcode}`)
          const data = sign.data
          const risk = data?.gt_result
          if (risk && typeof risk === 'object' && !Array.isArray(risk) && (risk.challenge || risk.gt || Number(risk.risk_code || 0) !== 0))
            throw new Error('签到需要验证，请完成米游社验证后手动发送签到命令')
          if (!data || data.challenge || data.gt || Number(data.success || 0) !== 0 || Number(data.risk_code || 0) !== 0)
            throw new Error('签到需要验证，请完成米游社验证后手动发送签到命令')
          record.status = 'success'
          message = '签到成功'
          days += 1
        }
      }
      message += `，本月累计 ${days} 天`
      try {
        const home = await request('bbs_sign_home', context, {})
        result.home = home
        const awards = home.data?.awards
        const award = Array.isArray(awards) ? awards[days - 1] : undefined
        if (home.retcode === 0 && award && typeof award === 'object' && !Array.isArray(award))
          message += `，奖励：${award.name} × ${award.cnt}`
        else message += `（奖励信息获取失败：${home.message}）`
      } catch (error) {
        result.reward_error = error instanceof Error ? error.message : String(error)
        message += `（奖励信息获取失败：${result.reward_error}）`
      }
    } catch (error) {
      record.status = 'failed'
      result.error = error instanceof Error ? error.message : String(error)
      message = `签到失败：${result.error}`
    }
    record.result = JSON.stringify(result)
    await writeTransaction(async transaction => { await record.save({ transaction }) })
    return `${label}：${message}`
  } finally {
    running.delete(key)
  }
}

/** 为发送者全部绑定账号的指定游戏角色手动签到。
 * @param userId 发送者 ID
 * @param game 游戏
 * @returns 每个角色的签到结果
 */
export async function signUser(userId: string, game: Game): Promise<string[]> {
  const messages: string[] = []
  const seen = new Set<string>()
  for (const account of await getAccounts(userId)) {
    for (const uid of account.uids[game] || []) {
      if (seen.has(uid)) continue
      seen.add(uid)
      messages.push(await signRole(String(account.ltuid), game, uid, true))
    }
  }
  return messages.length ? messages : [`请先绑定${gameNames[game]}的米游社账号`]
}

/** 执行已开启账号的每日自动签到，逐角色隔离错误且不重试。
 * @returns 执行完成
 */
export async function runAutoSign(): Promise<void> {
  const linked = new Set((await UserDB.findAll()).flatMap(user => (user.ltuids || '').split(',')))
  for (const setting of await AutoSignSettingDB.findAll({ where: { enabled: true } })) {
    if (!linked.has(String(setting.ltuid))) continue
    if (!['gs', 'sr', 'zzz'].includes(setting.game)) continue
    const account = await MysUserDB.findByPk(setting.ltuid)
    for (const uid of account?.uids[setting.game] || []) {
      try {
        // 执行前重新检查开关，允许排队期间关闭。
        await setting.reload()
        if (!setting.enabled) break
        logger.mark(await signRole(String(setting.ltuid), setting.game, uid, false))
      } catch (error) {
        logger.error(`[mhy-plugin] 自动签到 ${setting.game}/${uid} 执行失败`, error)
      }
    }
  }
}

/** 查询发送者关联账号的三游戏自动签到开关。
 * @param userId 发送者 ID
 * @returns 状态文本
 */
export async function getSignStatus(userId: string): Promise<string> {
  const lines: string[] = []
  for (const account of await getAccounts(userId)) {
    const settings = await AutoSignSettingDB.findAll({ where: { ltuid: String(account.ltuid) } })
    const switches: string[] = []
    for (const game of ['gs', 'sr', 'zzz'] as const) {
      const setting = settings.find(item => item.game === game)
      switches.push(`${gameNames[game]}: ${setting?.enabled ? '开' : '关'}`)
    }
    lines.push(`米游社账号 ${account.ltuid} 自动签到状态\n${switches.join(' | ')}`)
  }
  return lines.join('\n\n') || '请先扫码绑定米游社账号'
}
