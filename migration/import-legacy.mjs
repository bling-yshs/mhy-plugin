import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Sequelize, QueryTypes } from 'sequelize'
import YAML from 'yaml'
import { createClient } from 'redis'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dbIndex = args.indexOf('--database')
if (dbIndex < 0 || !args[dbIndex + 1])
  throw new Error(
    '用法：node migration/import-legacy.mjs --database <SQLite路径> [--apply] [--stokens <目录>] [--device-source 账号=miao|zzz]；Redis 使用 MHY_IMPORT_REDIS_URL',
  )
const database = path.resolve(args[dbIndex + 1])
const sourceIndex = args.indexOf('--stokens')
const source =
  sourceIndex < 0
    ? fileURLToPath(new URL('../../xiaoyao-cvs-plugin/data/yaml/', import.meta.url))
    : path.resolve(args[sourceIndex + 1])
const preferred = new Map()
for (let i = 0; i < args.length; i++)
  if (args[i] === '--device-source') {
    const [id, origin] = (args[++i] || '').split('=')
    if (!/^\d+$/.test(id) || !['miao', 'zzz'].includes(origin))
      throw new Error('设备来源格式应为：账号=miao 或 账号=zzz')
    preferred.set(id, origin)
  }
await readFile(database)
const db = new Sequelize({ dialect: 'sqlite', storage: database, logging: false })
let client
let target
const report = []
const candidates = new Map()

/** 添加来源候选，不写入来源。
 * @param {string} id 账号 ID
 * @param {object} candidate 候选数据
 * @returns {void}
 */
function add(id, candidate) {
  if (!/^\d+$/.test(id || '')) {
    report.push({ source: candidate.source, status: 'invalid', reason: '缺少账号归属' })
    return
  }
  const list = candidates.get(id) || []
  list.push(candidate)
  candidates.set(id, list)
}

/** 按对象键排序比较设备，避免序列化顺序造成冲突。
 * @param {object} value 待比较数据
 * @returns {string} 稳定 JSON
 */
function stable(value) {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return JSON.stringify(
      Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, JSON.parse(stable(value[key]))]),
      ),
    )
  return JSON.stringify(value ?? null)
}

try {
  let files = []
  try {
    files = await readdir(source)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const file of files.filter((name) => name.endsWith('.yaml'))) {
    try {
      const document = YAML.parse(await readFile(path.join(source, file), 'utf8'))
      const entries = document?.stoken ? [document] : Object.values(document || {})
      for (const item of entries) {
        if (!item || typeof item !== 'object' || !item.stoken) continue
        const id = String(item.stuid || item.ltuid || item.account_id || '')
        if (typeof item.stoken !== 'string' || !item.mid) {
          report.push({
            accountId: id,
            source: file,
            status: 'invalid',
            reason: '缺少 SToken 或 MID',
          })
          continue
        }
        add(id, {
          source: file,
          userId: file.replace(/\.yaml$/, ''),
          stoken: item.stoken,
          mid: String(item.mid),
        })
      }
    } catch {
      report.push({ source: file, status: 'invalid', reason: 'YAML 解析失败' })
    }
  }
  if (process.env.MHY_IMPORT_REDIS_URL) {
    client = createClient({
      url: process.env.MHY_IMPORT_REDIS_URL,
      socket: { reconnectStrategy: false },
    })
    client.on('error', () => {})
    await client.connect()
    const ids = new Set()
    for (const pattern of ['miao:device:*', 'ZZZ:DEVICE_FP:*']) {
      for await (const batch of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        for (const key of Array.isArray(batch) ? batch : [batch]) {
          const id = /^(?:miao:device:|ZZZ:DEVICE_FP:)(\d+)/.exec(key)?.[1]
          if (id) ids.add(id)
        }
      }
    }
    for (const id of ids) {
      try {
        const miao = await client.get(`miao:device:${id}`)
        if (miao) add(id, { source: 'miao', device: JSON.parse(miao) })
        const [fp, deviceId, android] = await Promise.all(
          ['FP', 'ID', 'BIND'].map((key) => client.get(`ZZZ:DEVICE_FP:${id}:${key}`)),
        )
        if (fp || android) {
          if (!deviceId && !android) {
            report.push({ accountId: id, source: 'zzz', status: 'invalid', reason: '缺少设备 ID' })
            continue
          }
          const device = {
            device_id:
              deviceId ||
              createHash('sha256').update(`legacy-zzz:${id}`).digest('hex').slice(0, 32),
            ...(fp ? { device_fp: fp } : {}),
            ...(android ? { android: JSON.parse(android), expiresAt: 0 } : {}),
          }
          add(id, { source: 'zzz', device })
        }
      } catch {
        report.push({ accountId: id, status: 'invalid', reason: '设备记录解析失败' })
      }
    }
  }
  const rows = await db.query('SELECT * FROM MysUsers', { type: QueryTypes.SELECT })
  const users = await db.query('SELECT * FROM Users', { type: QueryTypes.SELECT })
  if (apply) {
    const columns = await db.getQueryInterface().describeTable('MysUsers')
    if (['stoken', 'mid', 'login_device', 'bound_device'].some((key) => !columns[key])) {
      throw new Error('请先执行 node migration/upgrade-database.mjs --database <SQLite路径>')
    }
    process.env.MHY_DATABASE_PATH = database
    target = await import('../dist/db/index.js')
  }
  for (const [id, entries] of candidates) {
    const account = rows.find((row) => String(row.ltuid) === id)
    if (!account) {
      report.push({ accountId: id, status: 'skipped', reason: '目标账号不存在，先绑定 CK 或扫码' })
      continue
    }
    const updates = {}
    let conflict = false
    const tokens = entries.filter((item) => item.stoken)
    if (tokens.length) {
      const values = new Set(tokens.map((item) => stable({ stoken: item.stoken, mid: item.mid })))
      if (values.size > 1) conflict = true
      else {
        for (const key of ['stoken', 'mid']) {
          if (account[key] && account[key] !== tokens[0][key]) conflict = true
          else if (!account[key]) updates[key] = tokens[0][key]
        }
      }
    }
    let devices = entries.filter((item) => item.device)
    if (preferred.has(id)) devices = devices.filter((item) => item.source === preferred.get(id))
    if (devices.length) {
      const values = new Set(devices.map((item) => stable(item.device)))
      if (values.size > 1) conflict = true
      else {
        const device = devices[0].device
        const fields = [
          'deviceName',
          'deviceBoard',
          'deviceModel',
          'oaid',
          'androidVersion',
          'deviceFingerprint',
          'deviceProduct',
        ]
        if (
          typeof device.device_id !== 'string' ||
          !device.device_id ||
          (!device.device_fp && !device.android) ||
          (device.android && fields.some((key) => !device.android[key]))
        ) {
          report.push({ accountId: id, status: 'invalid', reason: '设备信息不完整' })
          continue
        }
        if (account.bound_device && stable(JSON.parse(account.bound_device)) !== stable(device))
          conflict = true
        else if (!account.bound_device) updates.bound_device = JSON.stringify(device)
      }
    }
    if (conflict) {
      report.push({ accountId: id, status: 'conflict', reason: '来源或目标数据存在差异，已跳过' })
      continue
    }
    const links = tokens.filter(
      (token) =>
        /^\d+$/.test(token.userId) || users.some((user) => String(user.id) === token.userId),
    )
    if (apply)
      await target.writeTransaction(async (transaction) => {
        const current = await target.MysUserDB.findByPk(id, { transaction })
        for (const key of Object.keys(updates))
          if ((current.get(key) ?? null) !== (account[key] ?? null))
            throw new Error('目标数据在导入期间发生变更，请重新预览')
        if (Object.keys(updates).length) await current.update(updates, { transaction })
        for (const link of links) {
          const user =
            (await target.UserDB.findByPk(link.userId, { transaction })) ||
            target.UserDB.build({ id: link.userId, type: 'qq', games: {} })
          const ids = new Set((user.ltuids || '').split(',').filter(Boolean))
          ids.add(id)
          user.ltuids = [...ids].join(',')
          await user.save({ transaction })
        }
      })
    const changed =
      Object.keys(updates).length ||
      links.some(
        (link) =>
          !(users.find((user) => String(user.id) === link.userId)?.ltuids || '')
            .split(',')
            .includes(id),
      )
    report.push({
      accountId: id,
      status: changed ? (apply ? 'imported' : 'would-import') : 'unchanged',
      fields: Object.keys(updates),
    })
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', records: report }, null, 2))
} finally {
  if (client?.isOpen) await client.quit()
  await db.close()
  if (target) await target.sequelize.close()
}
