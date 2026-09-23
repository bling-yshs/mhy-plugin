import { randomBytes } from 'node:crypto'
import { MysUserDB, UserDB, writeTransaction } from '../db/index.js'
import { accountUsers, getAccounts, resolveAccount } from './accounts.js'
import { notifyAccountChange } from './account-events.js'
import { getServer } from './request.js'
import { createSignDs } from './sign.js'
import fetch from './fetch.js'

type TokenData = { ltoken?: string; cookie_token?: string; authkey?: string }
const refreshing = new Set<string>()

/** 请求凭据接口并校验 HTTP、业务状态及响应数据。
 * @param url 米游社接口地址
 * @param init 请求参数
 * @param label 面向用户的操作名称
 * @returns 接口返回的凭据数据
 */
async function requestToken(url: string, init: RequestInit, label: string): Promise<TokenData> {
  const response = await fetch(url, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`${label}失败：HTTP ${response.status}`)
  const payload = (await response.json()) as {
    retcode: number
    data?: TokenData
  }
  if (payload.retcode !== 0 || !payload.data)
    throw new Error(`${label}失败：返回码 ${payload.retcode}，请尝试重新扫码登录`)
  return payload.data
}

/** 使用 SToken 兑换独立的 LToken。
 * @param accountId 米游社账号 ID
 * @param stoken 扫码取得的 SToken
 * @param mid 米游社 MID
 * @param signal 会话取消信号
 * @returns 兑换得到的 LToken
 */
export async function getLTokenBySToken(
  accountId: string,
  stoken: string,
  mid?: string,
  signal?: AbortSignal,
): Promise<string> {
  const cookie = `stuid=${accountId};stoken=${stoken};${mid ? `mid=${mid};` : ''}`
  const data = await requestToken(
    'https://passport-api.mihoyo.com/account/auth/api/getLTokenBySToken',
    { headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0 miHoYoBBS/2.71.1' }, signal },
    '获取 ltoken',
  )
  if (!data.ltoken || data.ltoken === stoken || /^v2_/i.test(data.ltoken))
    throw new Error('获取 ltoken 失败：响应缺少有效的 LToken，请重新扫码登录')
  return data.ltoken
}

/** 用发送者已绑定账号的 SToken 兑换 LToken 和 Cookie Token，并刷新兼容缓存。
 * @param userId 发送者的主用户 ID
 * @returns 各账号的刷新结果
 */
export async function refreshUserCookies(userId: string): Promise<string[]> {
  const accounts = await getAccounts(userId)
  if (!accounts.length) return ['请先发送 #扫码登录 绑定米游社账号']
  const results: string[] = []
  for (const account of accounts) {
    const accountId = String(account.ltuid)
    if (!account.stoken) {
      results.push(`账号 ${accountId}：缺少 stoken，请重新扫码登录`)
      continue
    }
    if (refreshing.has(accountId)) {
      results.push(`账号 ${accountId}：正在刷新，请稍后再试`)
      continue
    }
    refreshing.add(accountId)
    try {
      const cookie = `stuid=${accountId};stoken=${account.stoken};${account.mid ? `mid=${account.mid};` : ''}`
      const headers = { Cookie: cookie, 'User-Agent': 'Mozilla/5.0 miHoYoBBS/2.71.1' }
      const ltoken = await getLTokenBySToken(accountId, account.stoken, account.mid ?? undefined)
      const query = new URLSearchParams({
        game_biz: 'hk4e_cn',
        uid: accountId,
        stoken: account.stoken,
      })
      if (account.mid) query.set('mid', account.mid)
      const token = await requestToken(
        `https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken?${query}`,
        { headers },
        '获取 cookie_token',
      )
      if (!token.cookie_token) throw new Error('响应缺少 cookie_token，请重新扫码登录')
      const ck = `ltoken=${ltoken};ltuid=${accountId};cookie_token=${token.cookie_token};account_id=${accountId};`
      await writeTransaction(async (transaction) => {
        const current = await MysUserDB.findByPk(accountId, { transaction })
        const user = await UserDB.findByPk(userId, { transaction })
        if (
          !user?.ltuids.split(',').includes(accountId) ||
          !current ||
          current.stoken !== account.stoken ||
          current.mid !== account.mid ||
          current.ck !== account.ck
        )
          throw new Error('账号绑定或凭据已变更，请重新执行刷新')
        await current.update({ ck }, { transaction, fields: ['ck'] })
      })
      await notifyAccountChange({ accountId, userIds: await accountUsers(accountId) })
      results.push(`账号 ${accountId}：CK 刷新成功`)
    } catch (error) {
      results.push(
        `账号 ${accountId}：${error instanceof Error ? error.message : '刷新失败，请稍后重试'}`,
      )
    } finally {
      refreshing.delete(accountId)
    }
  }
  return results
}

/** 用当前原神角色所属账号的 SToken 生成抽卡记录导入链接。
 * @param userId 发送者的主用户 ID
 * @returns 角色 UID 和供 genshin 导入的链接
 */
export async function getGachaImportUrl(userId: string): Promise<{ uid: string; url: string }> {
  const user = await UserDB.findByPk(userId)
  const account = await resolveAccount(userId, 'gs')
  if (!account?.stoken) throw new Error('当前原神账号缺少 stoken，请先发送 #扫码登录')
  const selectedUid = user?.games.gs?.uid
  const uid =
    (selectedUid && account.uids.gs?.includes(selectedUid) ? selectedUid : account.uids.gs?.[0]) ||
    ''
  if (!uid) throw new Error('该账号没有绑定原神角色')
  const region = getServer(uid, 'gs')
  if (!['cn_gf01', 'cn_qd01'].includes(region))
    throw new Error('当前扫码账号仅支持国服原神抽卡记录更新')
  const body = JSON.stringify({
    auth_appid: 'webview_gacha',
    game_biz: 'hk4e_cn',
    game_uid: Number(uid),
    region,
  })
  const data = await requestToken(
    'https://api-takumi.mihoyo.com/binding/api/genAuthKey',
    {
      method: 'POST',
      body,
      headers: {
        Cookie: `stuid=${account.ltuid};stoken=${account.stoken};${account.mid ? `mid=${account.mid};` : ''}`,
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/4.8.0',
        'x-rpc-app_version': '2.70.1',
        'x-rpc-client_type': '5',
        'x-rpc-device_id': account.device || randomBytes(16).toString('hex'),
        'x-rpc-sys_version': '12',
        'x-rpc-channel': 'mihoyo',
        Referer: 'https://app.mihoyo.com',
        Origin: 'https://webstatic.mihoyo.com',
        DS: createSignDs('sjdNFJB7XxyDWGIAk0eTV8AOCfMJmyEo'),
      },
    },
    '获取抽卡记录授权',
  )
  if (!data.authkey) throw new Error('响应缺少 authkey，请重新扫码登录')
  const params = new URLSearchParams({
    authkey: data.authkey,
    authkey_ver: '1',
    sign_type: '2',
    auth_appid: 'webview_gacha',
    game_biz: 'hk4e_cn',
    region,
    lang: 'zh-cn',
  })
  return {
    uid,
    url: `https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog?${params}`,
  }
}
