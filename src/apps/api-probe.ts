import { getAccounts, resolveAccount } from '../lib/accounts.js'
import { execute, handlesOperation } from '../lib/request.js'
import type { Game, JsonValue } from '../types/api.js'

type ApiProbeInput = {
  operation: string
  game?: Game
  uid?: string | number
  accountId?: string | number
  params?: Record<string, JsonValue>
  query?: Record<string, JsonValue>
  body?: JsonValue
  method?: 'GET' | 'POST'
}

const EXAMPLE = [
  '发送 JSON 测试已接管的米游社接口，UID 默认取当前绑定角色。',
  '#mhy接口测试',
  '{"operation":"detail","game":"gs","params":{"avatar_id":10000002}}',
  '批量详情示例：',
  '#mhy接口测试',
  '{"operation":"characterDetail","game":"gs","body":{"character_ids":[10000002,10000003]}}',
  '可选字段：uid、accountId、query、body、method。body 中的字段会覆盖 SDK 请求体的同名字段。',
].join('\n')

export class MhyApiProbe extends plugin {
  /** 注册仅主人可用的接口测试命令。
   * @returns 命令实例
   */
  constructor() {
    super({
      name: '[mhy-plugin]接口测试',
      dsc: '测试已接管的米游社接口并记录完整请求历史',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#(?:mhy|米游社)接口测试(?:\\s|$)',
          fnc: 'probe',
          permission: 'master',
          log: false,
        },
      ],
    })
  }

  /** 解析命令 JSON，使用绑定账号发起请求并记录响应。
   * @returns 是否已处理
   */
  async probe(): Promise<boolean> {
    let source = this.e.msg.replace(/^#(?:mhy|米游社)接口测试/, '').trim()
    if (!source) {
      await this.reply(EXAMPLE)
      return true
    }
    if (source.length > 16384) {
      await this.reply('请求内容超过 16 KB')
      return true
    }
    if (source.startsWith('```')) {
      source = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    }

    try {
      const input = JSON.parse(source) as ApiProbeInput
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('请求内容必须是 JSON 对象')
      if (
        typeof input.operation !== 'string' ||
        input.operation === 'getFp' ||
        !handlesOperation(input.operation)
      )
        throw new Error('operation 必须是 mhy-plugin 已接管的接口名')
      const game = input.game || 'gs'
      if (!['gs', 'sr', 'zzz'].includes(game)) throw new Error('game 只能是 gs、sr 或 zzz')
      if (input.params && (typeof input.params !== 'object' || Array.isArray(input.params)))
        throw new Error('params 必须是 JSON 对象')
      if (input.query && (typeof input.query !== 'object' || Array.isArray(input.query)))
        throw new Error('query 必须是 JSON 对象')
      if (input.method && !['GET', 'POST'].includes(input.method))
        throw new Error('method 只能是 GET 或 POST')

      const userId = String(this.e.mainUserId || this.e.originalUserId || this.e.user_id)
      const account = input.accountId
        ? (await getAccounts(userId)).find((item) => String(item.ltuid) === String(input.accountId))
        : await resolveAccount(userId, game)
      if (!account?.ck) throw new Error('请先绑定米游社账号')
      const uid = String(input.uid || account.uids?.[game]?.[0] || '')
      if (!uid) throw new Error(`该账号没有 ${game} 游戏 UID，请在 JSON 中指定 uid`)

      const bodyParams =
        input.body && typeof input.body === 'object' && !Array.isArray(input.body) ? input.body : {}
      const params: Record<string, JsonValue | undefined> = {
        ...input.query,
        ...bodyParams,
        ...input.params,
      }
      if (input.query) params.query = input.query
      const response = await execute(
        input.operation,
        { game, uid, accountId: String(account.ltuid), cookie: account.ck },
        params,
        { method: input.method, body: input.body, history: true },
      )
      await this.reply(
        `${response.retcode === 0 ? '请求成功' : '接口已响应'}：${input.operation}，retcode=${response.retcode}。请求与响应已记录在 plugins/mhy-plugin/fetch-history。`,
      )
    } catch (error) {
      await this.reply(`接口测试失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
    return true
  }
}
