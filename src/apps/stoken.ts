import { getGachaImportUrl, refreshUserCookies } from '../lib/stoken.js'

const running = new Set<string>()

export class MhyStoken extends plugin {
  /** 注册 CK 刷新和原神抽卡记录更新命令。
   * @returns 命令实例
   */
  constructor() {
    super({
      name: '[mhy-plugin]SToken',
      dsc: '刷新米游社 CK、更新原神抽卡记录',
      event: 'message',
      priority: 90,
      rule: [
        { reg: /^#刷新ck$/i, fnc: 'refreshCookie' },
        { reg: /^#更新抽卡记录$/, fnc: 'updateGacha' },
      ],
    })
  }

  /** 刷新发送者全部绑定账号的 CK，并逐个报告结果。
   * @returns 是否处理命令
   */
  async refreshCookie(): Promise<boolean> {
    const userId = String(this.e.mainUserId || this.e.originalUserId || this.e.user_id)
    const key = `mhy:refresh-ck:${userId}`
    if (running.has(key)) {
      await this.reply('CK 正在刷新，请稍候')
      return true
    }
    running.add(key)
    try {
      if (!(await redis.set(key, '1', { NX: true, EX: 60 }))) {
        await this.reply('CK 正在刷新或请求过快，请一分钟后再试')
        return true
      }
      await this.reply((await refreshUserCookies(userId)).join('\n'))
    } catch {
      await this.reply('刷新 CK 失败，请稍后重试')
    } finally {
      running.delete(key)
    }
    return true
  }

  /** 生成当前原神角色的 authkey，并交给 genshin 更新抽卡记录。
   * @returns 是否处理命令
   */
  async updateGacha(): Promise<boolean> {
    const userId = String(this.e.mainUserId || this.e.originalUserId || this.e.user_id)
    const key = `mhy:update-gacha:${userId}`
    if (running.has(key)) {
      await this.reply('抽卡记录正在更新，请稍候')
      return true
    }
    running.add(key)
    let acquired = false
    try {
      acquired = !!(await redis.set(key, '1', { NX: true, EX: 300 }))
      if (!acquired) {
        await this.reply('请求过快，请五分钟后再试')
        return true
      }
      const modelUrl = new URL('../../../genshin/model/gachaLog.js', import.meta.url)
      const { default: GachaLog } = await import(modelUrl.href)
      const { uid, url } = await getGachaImportUrl(userId)
      await this.reply(`原神 ${uid} 抽卡记录更新中……`)
      const event = { ...this.e, user_id: userId, uid, msg: url, game: 'gs', isSr: false }
      try {
        await new GachaLog(event).logUrl()
      } catch {
        throw new Error('抽卡记录导入失败，请稍后重试')
      }
    } catch (error) {
      if (acquired) await redis.del(key).catch(() => {})
      await this.reply(error instanceof Error ? error.message : '抽卡记录更新失败，请稍后重试')
    } finally {
      running.delete(key)
    }
    return true
  }
}
