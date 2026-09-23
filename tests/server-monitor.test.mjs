import test, { after } from 'node:test'
import assert from 'node:assert/strict'

const originalFetch = globalThis.fetch
globalThis.plugin = class {
  /** 保存命令配置供离线验证。
   * @param {object} options 插件配置
   */
  constructor(options) {
    Object.assign(this, options)
  }

  /** 模拟命令回复。
   * @param {string} message 回复内容
   * @returns {Promise<void>} 回复完成
   */
  async reply(message) {
    this.replies.push(message)
  }
}
globalThis.logger = { warn() {} }
const { isGenshinServerOpen } = await import('../dist/lib/server-monitor.js')
const { MhyServerMonitor } = await import('../dist/apps/server-monitor.js')
after(() => {
  globalThis.fetch = originalFetch
})

/** 构造标准接口响应。
 * @param {object | null} body 响应内容
 * @returns {Response} JSON 响应
 */
function response(body) {
  return new Response(JSON.stringify(body))
}

/** 创建指定机器人和群的命令事件。
 * @param {number} botId 机器人编号
 * @param {number} groupId 群编号
 * @returns {MhyServerMonitor} 插件实例
 */
function command(botId, groupId) {
  const app = new MhyServerMonitor()
  app.replies = []
  app.messages = []
  app.e = {
    self_id: botId,
    group_id: groupId,
    isGroup: true,
    msg: '#开启开服监控',
    group: {
      /** 模拟当前群发送消息。
       * @param {string} message 群消息
       * @returns {Promise<object>} 消息回执
       */
      async sendMsg(message) {
        app.messages.push(message)
        return { message_id: 'test' }
      },
    },
  }
  return app
}

test('匿名请求参数与维护状态判定，保留维护文案时仍能识别开服', async () => {
  for (const ongoing of [true, false]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).hostname, 'topup-api-sdk.mihoyo.com')
      assert.equal(options.method, 'POST')
      assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
      assert.deepEqual(JSON.parse(options.body), {
        game: 'hk4e_cn',
        released_flag: true,
        condi: { cashier_mode: 'payment-cn', currency_by_ip: false },
      })
      return response({
        retcode: 0,
        data: {
          maintenance_info: {
            maintenance_ongoing: ongoing,
            popup_desc: '停服维护中，请耐心等待。',
          },
        },
      })
    }
    assert.equal(await isGenshinServerOpen(), ongoing === false)
  }
  for (const payload of [
    null,
    {},
    { retcode: -100 },
    { retcode: 0, data: {} },
    { retcode: 0, data: { maintenance_info: { popup_desc: null } } },
    ...[null, 'false', 'true', 0, 1].map((ongoing) => ({
      retcode: 0,
      data: { maintenance_info: { maintenance_ongoing: ongoing } },
    })),
  ]) {
    globalThis.fetch = async () => response(payload)
    await assert.rejects(isGenshinServerOpen())
  }
  globalThis.fetch = async () => new Response('failed', { status: 503 })
  await assert.rejects(isGenshinServerOpen(), /HTTP 503/)
  globalThis.fetch = async () => new Response('invalid JSON')
  await assert.rejects(isGenshinServerOpen())
})

test('每 30 秒执行、重复开启去重、多机器人群隔离及通知后停止', async () => {
  const first = command(1, 10)
  const second = command(2, 10)
  const third = command(1, 20)
  assert.equal(first.task.cron, '*/30 * * * * *')
  await first.toggle()
  await first.toggle()
  await second.toggle()
  await third.toggle()
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return response({ retcode: 0, data: { maintenance_info: { maintenance_ongoing: true } } })
  }
  await first.poll()
  assert.equal(calls, 3)
  assert.equal(first.messages.length, 0)
  globalThis.fetch = async () =>
    response({ retcode: 0, data: { maintenance_info: { maintenance_ongoing: false } } })
  await first.poll()
  await first.poll()
  for (const app of [first, second, third]) assert.deepEqual(app.messages, ['原神新版本已开服'])
})

test('请求并发防重、关闭拦截在途响应、发送失败下轮重试及私聊限制', async () => {
  const app = command(1, 30)
  await app.toggle()
  let release
  let calls = 0
  globalThis.fetch = () => {
    calls++
    return new Promise((resolve) => {
      release = resolve
    })
  }
  const pending = app.poll()
  await app.poll()
  assert.equal(calls, 1)
  app.e.msg = '#关闭开服监控'
  await app.toggle()
  release(response({ retcode: 0, data: { maintenance_info: { maintenance_ongoing: false } } }))
  await pending
  assert.equal(app.messages.length, 0)
  app.e.msg = '#开启开服监控'
  let sends = 0
  app.e.group.sendMsg = async () => ++sends > 1
  await app.toggle()
  globalThis.fetch = async () => {
    throw new Error('network failed')
  }
  await app.poll()
  assert.equal(sends, 0)
  globalThis.fetch = async () =>
    response({ retcode: 0, data: { maintenance_info: { maintenance_ongoing: false } } })
  await app.poll()
  await app.poll()
  await app.poll()
  assert.equal(sends, 2)
  app.e.isGroup = false
  await app.toggle()
  assert.match(app.replies.at(-1), /群内/)
})
