import { createMihoyoQrCode } from '../lib/mihoyo-qr-login.ts'

export class MhyQrLogin extends plugin {
  constructor() {
    super({
      name: '[mhy-plugin]扫码登录',
      dsc: '生成米游社扫码登录二维码到本地',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#扫码登录$',
          fnc: 'qrLogin',
        },
      ],
    })
  }

  async qrLogin() {
    try {
      const qr = await createMihoyoQrCode()
      logger.info(`[mhy-plugin] 米游社登录二维码已生成: ${qr.imagePath}`)
      await this.reply(`米游社登录二维码已生成到本地：${qr.imagePath}`)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[mhy-plugin] 生成米游社登录二维码失败: ${message}`)
      await this.reply(`生成米游社登录二维码失败：${message}`)
      return false
    }
  }
}
