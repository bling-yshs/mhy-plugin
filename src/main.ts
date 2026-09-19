import { createHash, randomInt, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import qrcode from 'qrcode-terminal'
import { httpJson } from './http.js'
import type {
  GenshinCharacterDetail,
  GenshinCharacterDetailResponse,
  GenshinRelic,
} from './types/genshin-character-detail.ts'

const QR_APP_ID = 'bll8iq97cem8'
const APP_VERSION = '2.71.1'
const CLIENT_TYPE = '5'
const DS2_SALT_4X = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs'
const POLL_INTERVAL_MS = 2_000
const STATE_FILE = new URL('../.mys-state.json', import.meta.url)
const DEVICE_CONFIG_FILE = new URL('../.mys-device.json', import.meta.url)

const CREATE_QR_URL =
  'https://passport-api.miyoushe.com/account/ma-cn-passport/web/createQRLogin'
const QUERY_QR_URL =
  'https://passport-api.miyoushe.com/account/ma-cn-passport/web/queryQRLoginStatus'
const DEVICE_FP_URL = 'https://public-data-api.mihoyo.com/device-fp/api/getFp'
const GAME_ROLES_URL =
  'https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie'
const GENSHIN_CHARACTER_LIST_URL =
  'https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/character/list'
const GENSHIN_CHARACTER_DETAIL_URL =
  'https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/character/detail'

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

type AndroidDeviceConfig = {
  deviceModel: string
  androidVersion: string
  deviceFingerprint: string
  deviceName: string
  deviceBoard: string
  deviceProduct: string
  oaid: string
}

type DeviceFpData = {
  device_fp: string
}

type QrStatusData = {
  status: QrStatus
  app_id: string
  client_type: number
  created_at: string
  scanned_at: string
  tokens: unknown[]
  user_info: null | {
    aid?: string
    mid?: string
    [key: string]: unknown
  }
  realname_info: unknown
  need_realperson: boolean
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

type GenshinCharacter = {
  id?: number
  name?: string
  level?: number
  image?: string
  icon?: string
  rarity?: number
  element?: string
  fetter?: number
  actived_constellation_num?: number
  [key: string]: unknown
}

type CookieUpdate = {
  at: string
  url: string
  set_cookie: string[]
}

type PersistedState = {
  version: 1
  device_id: string
  device_fp?: string
  device_fp_expires_at?: number
  cookies: Record<string, string>
  cookie_updates: CookieUpdate[]
  last_qr?: QrCreateData
  qr_confirmed?: QrStatusData
  game_roles?: GameRole[]
  updated_at: string
}

function createState(deviceId: string = randomUUID()): PersistedState {
  return {
    version: 1,
    device_id: deviceId,
    cookies: {},
    cookie_updates: [],
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
    const saved = JSON.parse(raw) as Partial<PersistedState> & Record<string, unknown>
    for (const key of [
      'response_history',
      'last_responses',
      'genshin_character_list',
      'genshin_character_details',
    ]) {
      delete saved[key]
    }
    const deviceId = saved.device_id || randomUUID()

    const state: PersistedState = {
      ...createState(deviceId),
      ...saved,
      version: 1,
      device_id: deviceId,
      cookies: saved.cookies ?? {},
      cookie_updates: saved.cookie_updates ?? [],
      updated_at: saved.updated_at ?? new Date().toISOString(),
    }

    await saveState(state)
    return state
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

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

function canonicalizeDsQuery(query: Record<string, string | number> | string | undefined) {
  if (query === undefined || query === '') return ''
  if (typeof query === 'string') {
    const value = query.startsWith('?') ? query.slice(1) : query
    return value.split('&').sort().join('&')
  }

  return Object.keys(query)
    .sort()
    .map((key) => `${key}=${String(query[key])}`)
    .join('&')
}

function createDs2({ body = '', query }: { body?: string; query?: Record<string, string | number> | string }) {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = String(randomInt(100_000, 200_001))
  const canonicalQuery = canonicalizeDsQuery(query)
  const source = `salt=${DS2_SALT_4X}&t=${timestamp}&r=${nonce}&b=${body}&q=${canonicalQuery}`
  return `${timestamp},${nonce},${md5(source)}`
}

function getApiRequestHeaders(
  state: PersistedState,
  { body = '', query }: { body?: string; query?: Record<string, string | number> | string } = {},
): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Cookie: toCookieHeader(state.cookies),
    DS: createDs2({ body, query }),
    Origin: 'https://webstatic.mihoyo.com',
    Referer: 'https://webstatic.mihoyo.com/',
    'User-Agent':
      `Mozilla/5.0 (Linux; Android 16; V2507A Build/BP2A.250605.031.A3_V000L1; wv) ` +
      `AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 ` +
      `Mobile Safari/537.36 miHoYoBBS/${APP_VERSION}`,
    'X-Requested-With': 'com.mihoyo.hyperion',
    'x-rpc-app_version': APP_VERSION,
    'x-rpc-client_type': CLIENT_TYPE,
    'x-rpc-device_id': state.device_id,
    ...(state.device_fp ? { 'x-rpc-device_fp': state.device_fp } : {}),
  }
}

async function loadAndroidDeviceConfig() {
  const raw = await readFile(DEVICE_CONFIG_FILE, 'utf8')
  return JSON.parse(raw) as AndroidDeviceConfig
}

function buildDeviceFpExtFields(deviceId: string, device: AndroidDeviceConfig) {
  const fingerprintParts = device.deviceFingerprint.split('/')
  const brand = fingerprintParts[0] || 'vivo'
  const display = fingerprintParts[3] || ''

  return {
    proxyStatus: 1,
    isRoot: 0,
    romCapacity: '768',
    deviceName: device.deviceModel,
    productName: device.deviceProduct,
    romRemain: '727',
    hostname: 'BuildHost',
    screenSize: '1096x2434',
    isTablet: 0,
    aaid: deviceId,
    model: device.deviceModel,
    brand,
    hardware: 'qcom',
    deviceType: device.deviceName,
    devId: 'REL',
    serialNumber: 'unknown',
    sdCapacity: 224845,
    buildTime: '1692775759000',
    buildUser: 'BuildUser',
    simState: 1,
    ramRemain: '218344',
    appUpdateTimeDiff: 1740498108042,
    deviceInfo: device.deviceFingerprint,
    vaid: deviceId,
    buildType: 'user',
    sdkVersion: '33',
    ui_mode: 'UI_MODE_TYPE_NORMAL',
    isMockLocation: 0,
    cpuType: 'arm64-v8a',
    isAirMode: 0,
    ringMode: 2,
    chargeStatus: 1,
    manufacturer: brand,
    emulatorStatus: 0,
    appMemory: '768',
    osVersion: device.androidVersion,
    vendor: 'unknown',
    accelerometer: '-1.588236x6.8404818x6.999604',
    sdRemain: 218214,
    buildTags: 'release-keys',
    packageName: 'com.mihoyo.hyperion',
    networkType: 'WiFi',
    oaid: device.oaid,
    debugStatus: 1,
    ramCapacity: '224845',
    magnetometer: '-47.04375x51.3375x137.96251',
    display,
    appInstallTimeDiff: 1740498108042,
    packageVersion: '2.35.0',
    gyroscope: '-0.22601996x-0.09453133x0.09040799',
    batteryStatus: 88,
    hasKeyboard: 0,
    board: device.deviceBoard,
  }
}

async function ensureDeviceFp(state: PersistedState) {
  if (state.device_fp && (state.device_fp_expires_at ?? 0) > Date.now()) {
    return state.device_fp
  }

  const device = await loadAndroidDeviceConfig()
  const body = {
    app_name: 'bbs_cn',
    bbs_device_id: state.device_id,
    device_id: state.device_id,
    device_fp: state.device_fp || '38d805c20d53d',
    ext_fields: JSON.stringify(buildDeviceFpExtFields(state.device_id, device)),
    platform: '2',
    seed_id: state.device_id,
    seed_time: String(Date.now()),
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-rpc-device_id': state.device_id,
  }
  const result = await httpJson<ApiResponse<DeviceFpData>>(DEVICE_FP_URL, {
    key: 'get_device_fp',
    method: 'POST',
    headers,
    body,
  })
  mergeCookieLines(state, result.rawSetCookie, DEVICE_FP_URL)
  await saveState(state)
  const payload = result.body
  assertApiSuccess(payload, '获取设备指纹')

  const deviceFp = payload.data?.device_fp
  if (!deviceFp) {
    throw new Error('获取设备指纹成功响应中没有 device_fp')
  }

  state.device_fp = deviceFp
  state.device_fp_expires_at = Date.now() + 7 * 24 * 60 * 60 * 1000
  await saveState(state)
  return deviceFp
}

function mergeCookieLines(state: PersistedState, setCookies: string[], url: string) {
  for (const setCookie of setCookies) {
    const match = setCookie.match(/^([^=;\s]+)=([^;]*)/)
    if (!match) continue

    const [, name, value] = match
    if (value === '') {
      delete state.cookies[name]
    } else {
      state.cookies[name] = value
    }
  }

  if (setCookies.length > 0) {
    state.cookie_updates.push({
      at: new Date().toISOString(),
      url,
      set_cookie: setCookies,
    })
  }
}

function hasLoginCookies(state: PersistedState) {
  return Boolean(state.cookies.ltoken_v2 && state.cookies.ltmid_v2)
}

function assertLoginCookies(state: PersistedState) {
  if (!hasLoginCookies(state)) {
    throw new Error(
      `扫码已经确认，但 Cookie Jar 中没有同时拿到 ltoken_v2 / ltmid_v2。当前 Cookie: ${Object.keys(state.cookies).join(', ') || '(empty)'}`,
    )
  }
}

function toCookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function assertApiSuccess<T>(payload: ApiResponse<T>, apiName: string) {
  if (payload.retcode !== 0) {
    throw new Error(`${apiName} 失败: retcode=${payload.retcode}, message=${payload.message}`)
  }
}

async function createQrLogin(state: PersistedState) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'x-rpc-app_id': QR_APP_ID,
    'x-rpc-device_id': state.device_id,
  }
  const result = await httpJson<ApiResponse<QrCreateData>>(CREATE_QR_URL, {
    key: 'create_qr_login',
    method: 'POST',
    headers,
  })
  mergeCookieLines(state, result.rawSetCookie, CREATE_QR_URL)
  await saveState(state)
  const payload = result.body
  assertApiSuccess(payload, '创建二维码')
  state.last_qr = payload.data
  await saveState(state)
  return payload.data
}

async function queryQrLoginStatus(state: PersistedState, ticket: string) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'x-rpc-app_id': QR_APP_ID,
    'x-rpc-device_id': state.device_id,
  }
  const body = { ticket }
  const result = await httpJson<ApiResponse<QrStatusData>>(QUERY_QR_URL, {
    key: 'query_qr_login_status',
    method: 'POST',
    headers,
    body,
  })
  mergeCookieLines(state, result.rawSetCookie, QUERY_QR_URL)
  await saveState(state)
  const payload = result.body
  return payload
}

async function waitForQrConfirmed(state: PersistedState, ticket: string) {
  let previousStatus: QrStatus | undefined

  while (true) {
    const payload = await queryQrLoginStatus(state, ticket)

    if (payload.retcode === -3501) {
      throw new Error('二维码已经过期，请重新运行 Demo 生成二维码')
    }
    if (payload.retcode === -3505) {
      throw new Error('你在手机上取消了扫码登录')
    }
    assertApiSuccess(payload, '查询二维码状态')

    if (payload.data.status !== previousStatus) {
      previousStatus = payload.data.status
      console.log(`扫码状态: ${payload.data.status}`)
    }

    if (payload.data.status === 'Confirmed') {
      state.qr_confirmed = payload.data
      assertLoginCookies(state)
      await saveState(state)
      return
    }

    await sleep(POLL_INTERVAL_MS)
  }
}

async function getGenshinRoles(state: PersistedState) {
  const query = { game_biz: 'hk4e_cn' }
  const queryString = canonicalizeDsQuery(query)
  const url = `${GAME_ROLES_URL}?${queryString}`
  const headers = getApiRequestHeaders(state, { query })
  const result = await httpJson<ApiResponse<{ list: GameRole[] }>>(url, {
    key: 'get_genshin_roles',
    headers,
  })
  mergeCookieLines(state, result.rawSetCookie, url)
  await saveState(state)
  const payload = result.body

  assertApiSuccess(payload, '获取绑定原神账号')
  state.game_roles = payload.data.list
  await saveState(state)
  return payload.data.list
}

async function listGenshinCharacters(state: PersistedState, role: GameRole) {
  const request = {
    role_id: role.game_uid,
    server: role.region,
  }
  const bodyText = JSON.stringify(request)
  const headers = getApiRequestHeaders(state, { body: bodyText })
  const result = await httpJson<ApiResponse<{ list: GenshinCharacter[] }>>(
    GENSHIN_CHARACTER_LIST_URL,
    {
      key: 'list_genshin_characters',
      method: 'POST',
      headers,
      body: request,
    },
  )
  mergeCookieLines(state, result.rawSetCookie, GENSHIN_CHARACTER_LIST_URL)
  await saveState(state)
  const payload = result.body

  assertApiSuccess(payload, '获取原神角色列表')
  return payload.data.list
}

async function getGenshinCharacterDetails(
  state: PersistedState,
  role: GameRole,
  characters: GenshinCharacter[],
) {
  const character = characters.find((item) => item.id !== undefined)
  if (!character?.id) {
    throw new Error('角色列表没有返回任何 character id，无法继续查询角色详情')
  }

  const request = {
    role_id: role.game_uid,
    server: role.region,
    character_ids: [character.id],
  }
  const bodyText = JSON.stringify(request)
  const headers = getApiRequestHeaders(state, { body: bodyText })
  const result = await httpJson<GenshinCharacterDetailResponse>(GENSHIN_CHARACTER_DETAIL_URL, {
    key: 'get_genshin_character_detail',
    method: 'POST',
    headers,
    body: request,
  })
  mergeCookieLines(state, result.rawSetCookie, GENSHIN_CHARACTER_DETAIL_URL)
  await saveState(state)
  const payload = result.body

  assertApiSuccess(payload, '获取原神角色详情')
  return payload.data.list
}

function getReliquaries(character: GenshinCharacterDetail): GenshinRelic[] {
  return character.relics
}

function printCharacters(characters: GenshinCharacterDetail[]) {
  console.log(`\n共返回 ${characters.length} 个角色详情：`)

  for (const character of characters) {
    const avatar = character.base
    console.log(`\n${avatar?.name ?? '未知角色'} (${avatar?.id ?? '?'}) Lv.${avatar?.level ?? '?'}`)

    const reliquaries = getReliquaries(character)
    if (reliquaries.length === 0) {
      console.log('  圣遗物: 无或接口未返回')
      continue
    }

    for (const relic of reliquaries) {
      const setName = relic.set?.name ? ` / ${relic.set.name}` : ''
      console.log(
        `  - ${relic.pos_name ?? relic.pos ?? '?'}: ${relic.name ?? '?'} +${relic.level ?? '?'} (${relic.rarity ?? '?'}★${setName})`,
      )
    }
  }
}

async function main() {
  const state = await loadOrCreateState()
  console.log(`device_id: ${state.device_id}`)
  console.log('本地状态文件: .mys-state.json')

  if (hasLoginCookies(state)) {
    console.log(`已复用本地 Cookie Jar（${Object.keys(state.cookies).length} 个 Cookie），跳过扫码登录`)
  } else {
    console.log('\n1. 创建米游社扫码登录二维码...')
    const qr = await createQrLogin(state)

    console.log('\n请使用米游社 App 扫码并在手机上确认登录：\n')
    qrcode.generate(qr.url, { small: true })
    console.log(`\n二维码原始 URL:\n${qr.url}\n`)

    console.log('2. 等待扫码确认...')
    await waitForQrConfirmed(state, qr.ticket)
    console.log(`登录态已持久化，共保存 ${Object.keys(state.cookies).length} 个 Cookie`)
  }

  console.log('\n3. 获取/复用米游社设备指纹...')
  const deviceFp = await ensureDeviceFp(state)
  console.log(`device_fp 已持久化: ${deviceFp}`)

  console.log('\n4. 查询当前米游社账号绑定的原神账号...')
  const roles = await getGenshinRoles(state)

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

  const role = roles[0]
  console.log(`使用第一个账号继续: ${role.nickname ?? '?'} / ${role.game_uid} / ${role.region}`)

  console.log('\n5. 直接请求米游社获取该 UID 的原神角色列表...')
  const characterList = await listGenshinCharacters(state, role)
  const firstCharacter = characterList.find((character) => character.id !== undefined)
  console.log(
    `角色列表共 ${characterList.length} 个，本次测试只查询第一个角色: ${firstCharacter?.name ?? '未知角色'} (${firstCharacter?.id ?? '?'})`,
  )

  console.log('\n6. 直接请求米游社获取第一个角色详情与当前穿戴圣遗物...')
  const characterDetails = await getGenshinCharacterDetails(state, role, characterList)
  printCharacters(characterDetails)
}

main().catch((error: unknown) => {
  console.error('\nDemo 执行失败：')
  console.error(error)
  process.exitCode = 1
})
