import {
  cancelLogin,
  QR_IMAGE_SIZE,
  QrLoginCancelledError,
  startLogin,
  waitForLogin,
} from '../lib/mihoyo-qr-login.js'

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
  /** 发送带触发者 QQ 头像的二维码并保存扫码结果。
   * @returns 是否处理
   */
  async qrLogin(): Promise<boolean> {
    const userId = String(this.e.mainUserId || this.e.originalUserId || this.e.user_id)
    const qq = String(this.e.originalUserId || this.e.user_id)
    const runtimeRenderer = this.e.runtime?.puppeteer
    const renderer = runtimeRenderer?.noscript_renderers?.[0] ?? runtimeRenderer
    let session
    try {
      session = await startLogin(userId)
      const { signal } = session.state
      let image = session.image!
      if (/^\d+$/.test(qq) && renderer?.render) {
        try {
          const avatar = await fetch(`https://q.qlogo.cn/g?b=qq&s=0&nk=${qq}`, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
          })
          const contentType = avatar.headers.get('content-type')?.split(';', 1)[0]?.trim()
          if (avatar.ok && contentType && /^image\/(jpeg|png|webp|gif)$/.test(contentType)) {
            const avatarData = Buffer.from(await avatar.arrayBuffer()).toString('base64')
            signal.throwIfAborted()
            const rendered = await renderer.render('mhy-plugin/qr-login', {
              html: `<!doctype html>
<style>
  body { margin: 0; }
  #container { position: relative; width: ${QR_IMAGE_SIZE}px; height: ${QR_IMAGE_SIZE}px; }
  .qr { display: block; width: 100%; height: 100%; }
  .avatar {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 36px; height: 36px; object-fit: cover;
    border: 2px solid white; border-radius: 50%; background: white;
  }
</style>
<div id="container">
  <img class="qr" src="data:image/png;base64,${image.toString('base64')}" alt="">
  <img class="avatar" src="data:${contentType};base64,${avatarData}" alt="">
</div>`,
              imgType: 'png',
              viewport: { width: QR_IMAGE_SIZE, height: QR_IMAGE_SIZE, deviceScaleFactor: 1 },
              pageGotoParams: { waitUntil: 'load', timeout: 5000 },
            })
            if (rendered instanceof Uint8Array && rendered.length) image = Buffer.from(rendered)
          }
        } catch {
          signal.throwIfAborted()
        }
      }
      signal.throwIfAborted()
      await this.reply([
        segment.image(image),
        '请使用米游社 App 扫码并确认，五分钟内有效。发送 #取消扫码登录 可取消。',
      ])
      const result = await waitForLogin(session, async (status) => {
        if (status === 'Scanned') await this.reply('二维码已扫描，请在手机上确认')
      })
      await this.reply(
        `米游社账号 ${result.accountId} 绑定成功，共同步 ${result.roles.length} 个游戏角色`,
      )
    } catch (error) {
      if (
        error instanceof QrLoginCancelledError ||
        session?.controller.signal.reason instanceof QrLoginCancelledError
      ) {
        return true
      }
      session?.controller.abort()
      await this.reply(error instanceof Error ? error.message : '扫码登录失败，请重试')
    }
    return true
  }
}
