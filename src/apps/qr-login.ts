import { cancelLogin, startLogin, waitForLogin } from '../lib/mihoyo-qr-login.js'

export class MhyQrLogin extends plugin {
  /** 注册扫码命令。
   * @returns 命令实例
   */
  constructor() {
    super({
      name: '[mhy-plugin]扫码登录',
      dsc: '扫码绑定米游社账号',
      event: 'message',
      priority: 100,
      rule: [
        { reg: '^#扫码登录$', fnc: 'qrLogin' },
        { reg: '^#取消扫码登录$', fnc: 'cancel' },
      ],
    })
  }
  /** 取消当前用户扫码。
   * @returns 是否处理
   */
  async cancel(): Promise<boolean> {
    cancelLogin(String(this.e.mainUserId || this.e.originalUserId || this.e.user_id))
    await this.reply('扫码登录已取消')
    return true
  }
  /** 发送二维码并保存扫码结果。
   * @returns 是否处理
   */
  async qrLogin(): Promise<boolean> {
    const userId = String(this.e.mainUserId || this.e.originalUserId || this.e.user_id)
    let session
    try {
      session = await startLogin(userId)
      await this.reply([
        segment.image(session.image!),
        '请使用米游社 App 扫码并确认，五分钟内有效。发送 #取消扫码登录 可取消。',
      ])
      const result = await waitForLogin(session, async (status) => {
        if (status === 'Scanned') await this.reply('二维码已扫描，请在手机上确认')
      })
      await this.reply(
        `米游社账号 ${result.accountId} 绑定成功，共同步 ${result.roles.length} 个游戏角色`,
      )
    } catch (error) {
      session?.controller.abort()
      await this.reply(error instanceof Error ? error.message : '扫码登录失败，请重试')
    }
    return true
  }
}
