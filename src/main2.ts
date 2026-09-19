import { createHash, randomBytes, randomInt } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import qrcode from 'qrcode-terminal'
import { httpJson } from './http.js'

const QR_APP_ID = 'bll8iq97cem8'
const APP_VERSION = '2.71.1'
const PASS_SALT = 'JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS'
const DS2_SALT_4X = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs'
const POLL_INTERVAL_MS = 2_000
const STATE_FILE = new URL('../.mys-app-state.json', import.meta.url)

const CREATE_QR_URL =
  'https://passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin'
const QUERY_QR_URL =
  'https://passport-api.mihoyo.com/account/ma-cn-passport/app/queryQRLoginStatus'
const COOKIE_BY_STOKEN_URL =
  'https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken'
const GAME_ROLES_URL =
  'https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie'

type ApiResponse<T> = {
  retcode: number
  message: string
  data: T
}

type QrCreateData = {
  url: string
  ticket: string
}

type QrStatus = 'Created' | 'Scanned' | 'Confirmed'

type QrToken = {
  name?: string
  token?: string
  token_type?: number
  [key: string]: unknown
}

type QrUserInfo = {
  aid?: string
  uid?: string
  account_id?: string
  mid?: string
  [key: string]: unknown
}

type QrStatusData = {
  status: QrStatus
  tokens?: QrToken[]
  user_info?: QrUserInfo | null
  [key: string]: unknown
}

type CookieTokenData = {
  account_id?: number | string
  uid?: string
  cookie_token?: string
  [key: string]: unknown
}

type GameRole = {
  game_biz: string
  region: string
  game_uid: string
  nickname: string
  level: number
  region_name: string
  is_chosen?: boolean
  [key: string]: unknown
}

type PersistedState = {
  version: 1
  device_id: string
  device_name: string
  device_model: string
  account_id?: string
  mid?: string
  stoken?: string
  cookie_token?: string
  game_roles?: GameRole[]
  updated_at: string
}

function createDeviceId() {
  return randomBytes(16).toString('hex').toUpperCase()
}

function createState(): PersistedState {
  const deviceId = createDeviceId()
  return {
    version: 1,
    device_id: deviceId,
    device_name: `Android-${deviceId.slice(0, 8)}`,
    device_model: deviceId.slice(0, 16),
    updated_at: new Date().toISOString(),
  }
}

async function saveState(state: PersistedState) {
  state.updated_at = new Date().toISOString()
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function loadOrCreateState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    return JSON.parse(raw) as PersistedState
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const state = createState()
    await saveState(state)
    return state
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function md5(input: string) {
  return createHash('md5').update(input, 'utf8').digest('hex')
}

function createDs2(body: string, salt: string, query = '') {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = String(randomInt(100_001, 200_001))
  const source = `salt=${salt}&t=${timestamp}&r=${nonce}&b=${body}&q=${query}`
  return `${timestamp},${nonce},${md5(source)}`
}

function assertApiSuccess<T>(payload: ApiResponse<T>, apiName: string) {
  if (payload.retcode !== 0) {
    throw new Error(`${apiName}失败: retcode=${payload.retcode}, message=${payload.message}`)
  }
}

function getPassportHeaders(state: PersistedState, body: string): Record<string, string> {
  return {
    'x-rpc-device_id': state.device_id,
    'x-rpc-app_id': QR_APP_ID,
    'x-rpc-device_name': state.device_name,
    'x-rpc-device_fp': '38d7ee0e96649',
    'x-rpc-device_model': state.device_model,
    'x-rpc-app_version': APP_VERSION,
    'x-rpc-game_biz': 'bbs_cn',
    'x-rpc-sys_version': '11',
    'x-rpc-aigis': '',
    'Content-Type': 'application/json',
    'x-rpc-client_type': '2',
    DS: createDs2(body, PASS_SALT),
    'x-rpc-sdk_version': '1.3.1.2',
    'User-Agent': 'okhttp/4.8.0',
    Connection: 'Keep-Alive',
    'Accept-Encoding': 'gzip, deflate, br',
    'x-rpc-channel': 'appstore',
  }
}

async function postPassport<T>(state: PersistedState, key: string, url: string, body: object) {
  const bodyText = JSON.stringify(body)
  const result = await httpJson<ApiResponse<T>>(url, {
    key,
    method: 'POST',
    headers: getPassportHeaders(state, bodyText),
    body,
  })
  return result.body
}

async function createQrLogin(state: PersistedState) {
  const payload = await postPassport<QrCreateData>(state, 'app_create_qr_login', CREATE_QR_URL, {})
  assertApiSuccess(payload, '创建 App 扫码二维码')
  if (!payload.data?.ticket || !payload.data?.url) {
    throw new Error('创建二维码成功响应中缺少 ticket 或 url')
  }
  return payload.data
}

async function queryQrLoginStatus(state: PersistedState, ticket: string) {
  return postPassport<QrStatusData>(state, 'app_query_qr_login_status', QUERY_QR_URL, { ticket })
}

async function waitForQrConfirmed(state: PersistedState, ticket: string) {
  let previousStatus: QrStatus | undefined

  while (true) {
    const payload = await queryQrLoginStatus(state, ticket)

    if (payload.retcode === -3501) {
      throw new Error('二维码已经过期，请重新运行 Demo')
    }
    if (payload.retcode === -3505) {
      throw new Error('你在手机上取消了扫码登录')
    }
    assertApiSuccess(payload, '查询 App 扫码状态')

    if (payload.data.status !== previousStatus) {
      previousStatus = payload.data.status
      console.log(`扫码状态: ${payload.data.status}`)
    }

    if (payload.data.status === 'Confirmed') {
      const userInfo = payload.data.user_info
      const accountId = userInfo?.aid || userInfo?.uid || userInfo?.account_id
      const mid = userInfo?.mid
      const tokenInfo =
        payload.data.tokens?.find((item) => item.name === 'stoken' || item.name === 'stoken_v2') ??
        payload.data.tokens?.[0]
      const stoken = tokenInfo?.token

      if (!accountId || !mid || !stoken) {
        throw new Error(
          `扫码已确认，但没有拿到完整 SToken 信息: accountId=${accountId ?? '-'}, mid=${mid ?? '-'}, tokens=${payload.data.tokens?.length ?? 0}`,
        )
      }

      state.account_id = accountId
      state.mid = mid
      state.stoken = stoken
      await saveState(state)
      return { accountId, mid, stoken }
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

async function getCookieTokenBySToken(
  state: PersistedState,
  login: { accountId: string; mid: string; stoken: string },
) {
  const query = new URLSearchParams({
    game_biz: 'hk4e_cn',
    stoken: login.stoken,
    uid: login.accountId,
    mid: login.mid,
  })
  const url = `${COOKIE_BY_STOKEN_URL}?${query}`
  const result = await httpJson<ApiResponse<CookieTokenData>>(url, {
    key: 'get_cookie_token_by_stoken',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': `Mozilla/5.0 miHoYoBBS/${APP_VERSION}`,
    },
  })
  const payload = result.body
  assertApiSuccess(payload, '使用 SToken 获取 Cookie Token')

  const cookieToken = payload.data?.cookie_token
  if (!cookieToken) {
    throw new Error('SToken 兑换成功响应中没有 cookie_token')
  }

  state.cookie_token = cookieToken
  await saveState(state)
  return cookieToken
}

function createRoleDs() {
  return createDs2('', DS2_SALT_4X, 'game_biz=hk4e_cn')
}

async function getGenshinRoles(
  state: PersistedState,
  login: { accountId: string; stoken: string },
  cookieToken: string,
) {
  const query = 'game_biz=hk4e_cn'
  const url = `${GAME_ROLES_URL}?${query}`
  const cookie = [
    `ltoken=${login.stoken}`,
    `ltuid=${login.accountId}`,
    `cookie_token=${cookieToken}`,
    `account_id=${login.accountId}`,
  ].join('; ')

  const result = await httpJson<ApiResponse<{ list: GameRole[] }>>(url, {
    key: 'app_get_genshin_roles',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Cookie: cookie,
      DS: createRoleDs(),
      'User-Agent':
        `Mozilla/5.0 (Linux; Android 16; wv) AppleWebKit/537.36 ` +
        `Mobile Safari/537.36 miHoYoBBS/${APP_VERSION}`,
      'x-rpc-app_version': APP_VERSION,
      'x-rpc-client_type': '5',
      'x-rpc-device_id': state.device_id,
    },
  })
  const payload = result.body
  assertApiSuccess(payload, '获取绑定原神账号')

  state.game_roles = payload.data.list
  await saveState(state)
  return payload.data.list
}

async function main() {
  const state = await loadOrCreateState()
  console.log(`device_id: ${state.device_id}`)
  console.log('本地状态文件: .mys-app-state.json')

  console.log('\n1. 创建 /app 扫码登录二维码...')
  const qr = await createQrLogin(state)

  console.log('\n请使用米游社 App 扫码并在手机上确认登录：\n')
  qrcode.generate(qr.url, { small: true })
  console.log(`\n二维码原始 URL:\n${qr.url}\n`)

  console.log('2. 等待扫码确认并获取 SToken...')
  const login = await waitForQrConfirmed(state, qr.ticket)
  console.log(`已获取 SToken，米哈游账号 ID: ${login.accountId}`)

  console.log('\n3. 使用 SToken 获取 Cookie Token...')
  const cookieToken = await getCookieTokenBySToken(state, login)
  console.log('Cookie Token 获取成功')

  console.log('\n4. 查询当前账号绑定的原神 UID...')
  const roles = await getGenshinRoles(state, login, cookieToken)
  if (roles.length === 0) {
    throw new Error('当前米游社账号没有绑定国服原神账号')
  }

  console.table(
    roles.map((role) => ({
      uid: role.game_uid,
      nickname: role.nickname,
      region: role.region,
      regionName: role.region_name,
      level: role.level,
    })),
  )
}

main().catch((error: unknown) => {
  console.error('\nDemo 执行失败：')
  console.error(error)
  process.exitCode = 1
})
