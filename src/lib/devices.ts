import fetch from './fetch.js'
import type { Device } from '../types/api.js'
import { MysUserDB, writeTransaction } from '../db/index.js'
import { ownsAccount } from './accounts.js'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createDs } from './sign.js'

const androidFields = [
  'deviceName',
  'deviceBoard',
  'deviceModel',
  'oaid',
  'androidVersion',
  'deviceFingerprint',
  'deviceProduct',
]
const refreshing = new Map<string, Promise<Device | undefined>>()
const revisions = new Map<string, symbol>()
const registered = new Map<string, number>()

/** 保留 ZZZ 获取指纹后的设备登记流程。
 * @param cookie 请求账号凭据
 * @param device 当前有效设备
 * @returns 登记完成，失败保留原有查询能力
 */
export async function registerDeviceSession(cookie: string, device: Device): Promise<void> {
  const key = createHash('sha256')
    .update(`${cookie}:${device.device_id}:${device.device_fp}`)
    .digest('hex')
  if ((registered.get(key) || 0) > Date.now()) return
  const info = device.android
  const name = info
    ? `${info.deviceFingerprint.split('/')[0]}${info.deviceModel}`
    : device.device_id
  try {
    for (const operation of ['deviceLogin', 'saveDevice']) {
      const body = JSON.stringify({
        app_version: '2.73.1',
        device_id: device.device_id,
        device_name: name,
        os_version: '33',
        platform: 'Android',
        registration_id: randomBytes(10).toString('hex').slice(0, 19),
      })
      const response = await fetch(`https://bbs-api.miyoushe.com/apihub/api/${operation}`, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(10000),
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          'x-rpc-device_id': device.device_id,
          'x-rpc-device_fp': device.device_fp || '',
          'x-rpc-app_version': '2.73.1',
          'x-rpc-client_type': '2',
          'x-rpc-device_name': name,
          'x-rpc-device_model': info?.deviceModel || device.device_id,
          'x-rpc-channel': 'mihoyo',
          'User-Agent': 'okhttp/4.8.0',
          Referer: 'https://act.mihoyo.com/',
          DS: createDs('', body),
        },
      })
      const result = (await response.json()) as { retcode?: number }
      if (!response.ok || result.retcode !== 0) return
    }
    registered.set(key, Date.now() + 7 * 86400000)
  } catch {
    console.warn('[mhy-plugin] 设备登记失败，将在后续查询重试')
  }
}

/** 读取账号的统一绑定设备。
 * @param accountId 米游社账号
 * @returns 设备或 undefined
 */
export async function getBoundDevice(accountId: string): Promise<Device | undefined> {
  const account = await MysUserDB.findByPk(accountId)
  return account?.bound_device ? JSON.parse(account.bound_device) : undefined
}

/** 校验用户归属并绑定设备。
 * @param userId 发起用户
 * @param accountId 目标账号
 * @param info 手动或安卓设备信息
 * @returns 已绑定设备
 */
export async function bindDevice(
  userId: string,
  accountId: string,
  info: unknown,
): Promise<Device> {
  if (!(await ownsAccount(userId, accountId))) throw new Error('账号绑定已变更')
  const revision = Symbol(accountId)
  revisions.set(accountId, revision)
  const account = await MysUserDB.findByPk(accountId)
  const previous = account?.bound_device ?? null
  let device = parseDevice(info)
  if (!device) throw new Error('设备信息格式错误')
  if (device.android) device = await refreshDevice(device)
  const saved = device
  await writeTransaction(async (transaction) => {
    if (revisions.get(accountId) !== revision) throw new Error('设备绑定已变更，请重试')
    if (!(await ownsAccount(userId, accountId))) throw new Error('账号绑定已变更')
    const [count] = await MysUserDB.update(
      { bound_device: JSON.stringify(saved) },
      { where: { ltuid: accountId, bound_device: previous }, transaction },
    )
    if (!count) throw new Error('设备绑定已变更，请重试')
  })
  return saved
}

/** 解除本人账号设备绑定。
 * @param userId 发起用户
 * @param accountId 目标账号
 * @returns 解除完成
 */
export async function unbindDevice(userId: string, accountId: string): Promise<void> {
  if (!(await ownsAccount(userId, accountId))) throw new Error('账号绑定已变更')
  revisions.set(accountId, Symbol(accountId))
  await writeTransaction(async (transaction) => {
    if (!(await ownsAccount(userId, accountId))) throw new Error('账号绑定已变更')
    await MysUserDB.update({ bound_device: null }, { where: { ltuid: accountId }, transaction })
  })
}

/** 合并同账号刷新并防止覆盖并发绑定。
 * @param accountId 请求所用账号
 * @returns 当前有效绑定设备
 */
export async function ensureDevice(accountId: string): Promise<Device | undefined> {
  const pending = refreshing.get(accountId)
  if (pending) return pending
  const job = (async () => {
    const account = await MysUserDB.findByPk(accountId)
    const raw = account?.bound_device
    if (!raw) return undefined
    const device: Device = JSON.parse(raw)
    if (!device.android || (device.device_fp && (device.expiresAt || 0) > Date.now())) return device
    const updated = await refreshDevice(device)
    const [count] = await writeTransaction((transaction) =>
      MysUserDB.update(
        { bound_device: JSON.stringify(updated) },
        { where: { ltuid: accountId, bound_device: raw }, transaction },
      ),
    )
    if (!count) throw new Error('设备绑定已变更，请重新查询')
    return updated
  })()
  refreshing.set(accountId, job)
  try {
    return await job
  } finally {
    if (refreshing.get(accountId) === job) refreshing.delete(accountId)
  }
}

/**
 * 校验并提取手动指纹或安卓设备信息。
 * @param {object} info 用户提交的设备JSON
 * @returns {object|false} 规范化的设备记录，格式错误时返回false
 */
export function parseDevice(info: any): Device | false {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return false
  if (info.device_id !== undefined || info.device_fp !== undefined) {
    for (const key of ['device_id', 'device_fp']) {
      if (typeof info[key] !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(info[key])) return false
    }
    return { device_id: info.device_id, device_fp: info.device_fp }
  }
  const android: Record<string, string> = {}
  for (const key of androidFields) {
    const value =
      key === 'androidVersion' && typeof info[key] === 'number' ? String(info[key]) : info[key]
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 1024 ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      return false
    android[key] = value.trim()
  }
  return { device_id: randomUUID(), android }
}

/**
 * 根据安卓设备信息请求米游社设备指纹，保留稳定设备ID。
 * @param {object} device 包含device_id和android信息的设备记录
 * @param {boolean} overseas 是否使用国际服指纹接口
 * @returns {Promise<object>} 包含指纹及七天有效期的新设备记录
 */
export async function refreshDevice(device: Device, overseas = false): Promise<Device> {
  const info = device.android!
  const uuid = device.device_id
  const brand = info.deviceFingerprint.split('/')[0]
  const display = info.deviceFingerprint.split('/')[3] || ''
  // 保持与ZZZ插件安卓指纹接口的字段一致。
  const ext = {
    proxyStatus: 1,
    isRoot: 0,
    romCapacity: '768',
    deviceName: info.deviceModel,
    productName: info.deviceProduct,
    romRemain: '727',
    hostname: 'BuildHost',
    screenSize: '1096x2434',
    isTablet: 0,
    aaid: uuid,
    model: info.deviceModel,
    brand,
    hardware: 'qcom',
    deviceType: info.deviceName,
    devId: 'REL',
    serialNumber: 'unknown',
    sdCapacity: 224845,
    buildTime: '1692775759000',
    buildUser: 'BuildUser',
    simState: 1,
    ramRemain: '218344',
    appUpdateTimeDiff: 1740498108042,
    deviceInfo: info.deviceFingerprint,
    vaid: uuid,
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
    osVersion: info.androidVersion,
    vendor: 'unknown',
    accelerometer: '-1.588236x6.8404818x6.999604',
    sdRemain: 218214,
    buildTags: 'release-keys',
    packageName: 'com.mihoyo.hyperion',
    networkType: 'WiFi',
    oaid: info.oaid,
    debugStatus: 1,
    ramCapacity: '224845',
    magnetometer: '-47.04375x51.3375x137.96251',
    display,
    appInstallTimeDiff: 1740498108042,
    packageVersion: '2.35.0',
    gyroscope: '-0.22601996x-0.09453133x0.09040799',
    batteryStatus: 88,
    hasKeyboard: 0,
    board: info.deviceBoard,
  }
  const response = await fetch(
    `https://${overseas ? 'sg-public-data-api.hoyoverse.com' : 'public-data-api.mihoyo.com'}/device-fp/api/getFp`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'x-rpc-device_id': uuid },
      body: JSON.stringify({
        app_name: overseas ? 'bbs_oversea' : 'bbs_cn',
        bbs_device_id: uuid,
        device_id: uuid,
        device_fp: device.device_fp || '38d805c20d53d',
        ext_fields: JSON.stringify(ext),
        platform: '2',
        seed_id: uuid,
        seed_time: String(Date.now()),
      }),
    },
  )
  if (!response.ok) throw new Error('获取设备指纹失败')
  const result = (await response.json()) as { retcode?: number; data?: { device_fp?: string } }
  const fp = result?.data?.device_fp
  if (
    Number(result?.retcode ?? 0) !== 0 ||
    typeof fp !== 'string' ||
    !/^[\x21-\x7e]{1,256}$/.test(fp)
  ) {
    throw new Error('获取设备指纹失败')
  }
  return { ...device, device_fp: fp, expiresAt: Date.now() + 7 * 86400 * 1000 }
}
