import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Sequelize } from 'sequelize'
import { upgradeDatabase } from '../upgrade-database.mjs'

const directory = await mkdtemp(path.join(tmpdir(), 'mhy-migration-'))
process.env.MHY_DATABASE_PATH = path.join(directory, 'accounts.sqlite')
const old = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.MHY_DATABASE_PATH,
  logging: false,
})
await old.query(
  'CREATE TABLE MysUsers (ltuid INTEGER PRIMARY KEY, type VARCHAR(255), ck VARCHAR(255), device VARCHAR(255), uids VARCHAR(255), createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)',
)
await old.query(
  "INSERT INTO MysUsers VALUES (100, 'mys', 'ltuid=100;cookie_token=old', 'device-100', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
)
let db
let api
const originalFetch = globalThis.fetch
globalThis.redis = { get: async () => null }
globalThis.logger = { error() {}, mark() {} }
after(async () => {
  globalThis.fetch = originalFetch
  await old.close()
  await db?.sequelize.close()
})

/** 创建模拟米哈游响应。
 * @param {object} data 响应数据
 * @returns {Response} HTTP 响应
 */
function response(data) {
  return new Response(JSON.stringify(data))
}

test('主插件启动保持历史表原样，不执行补列或备份', async () => {
  const moduleUrl = new URL('../../dist/db/index.js', import.meta.url).href
  await promisify(execFile)(process.execPath, [
    '--input-type=module',
    '-e',
    `const db = await import(${JSON.stringify(moduleUrl)}); await db.sequelize.close()`,
  ])
  const columns = await old.getQueryInterface().describeTable('MysUsers')
  assert.equal(columns.stoken, undefined)
  assert.equal((await readdir(directory)).filter((name) => name.includes('before-mhy')).length, 0)
})

test('手动升级保留历史数据，重复执行只生成一次备份', async () => {
  const result = await upgradeDatabase(process.env.MHY_DATABASE_PATH)
  assert.equal(result.columns.length, 4)
  assert.ok(result.backup)
  assert.deepEqual(await upgradeDatabase(process.env.MHY_DATABASE_PATH), {
    columns: [],
    backup: null,
  })
  db = await import('../../dist/db/index.js')
  api = await import('../../dist/api.js')
  assert.equal((await db.MysUserDB.findByPk('100')).ck, 'ltuid=100;cookie_token=old')
  assert.equal((await readdir(directory)).filter((name) => name.includes('before-mhy')).length, 1)
  await db.MysUserDB.create({
    ltuid: 101,
    type: 'mys',
    ck: 'ltuid=101;cookie_token=new',
    device: 'bound101',
    bound_device: JSON.stringify({ device_id: 'bound101', device_fp: 'fp101' }),
    uids: {},
  })
})

test('旧 getData 与新兼容边界交付相同完整响应', async () => {
  const source = await readFile(new URL('../fixtures/legacy-mys-api.txt', import.meta.url), 'utf8')
  const isolated = source.replace(/^import .*$/gm, '')
  const prelude = `const md5 = value => String(value); const fetch = (...args) => globalThis.fetch(...args); const cfg = { bot: {} }; class ApiTool {}\n`
  const Original = (
    await import(
      `data:text/javascript;base64,${Buffer.from(prelude + isolated).toString('base64')}`
    )
  ).default
  const oldApi = new Original('100000002', 'ltuid=101;cookie_token=new')
  oldApi._device_fp = { data: { device_fp: 'fp101' } }
  oldApi.getUrl = () => ({ url: 'https://test.invalid/character', headers: {}, body: '' })
  const payload = {
    retcode: 0,
    message: 'OK',
    data: {
      list: [
        { base: { id: 10000021 }, relics: [], weapon: { id: 11501 }, selected_properties: [] },
      ],
      property_map: {},
      relic_property_options: {},
      added: null,
    },
  }
  globalThis.fetch = async () => response(payload)
  const before = await oldApi.getData('characterDetail', { character_ids: [10000021] })
  const after = await api.legacyGetData(oldApi, 'characterDetail', { character_ids: [10000021] })
  assert.deepEqual(after, before)
})

test('独立导入预览只读，重复导入与冲突保护源数据', async () => {
  const sourceDir = path.join(directory, 'legacy')
  await mkdir(sourceDir)
  const sourceFile = path.join(sourceDir, '123456.yaml')
  const yaml = '100:\n  stuid: 100\n  mid: legacy-mid\n  stoken: v2_legacy\n'
  await writeFile(sourceFile, yaml)
  const run = promisify(execFile)
  const script = fileURLToPath(new URL('../import-legacy.mjs', import.meta.url))
  const args = [script, '--database', process.env.MHY_DATABASE_PATH, '--stokens', sourceDir]
  const before = await readFile(process.env.MHY_DATABASE_PATH)
  const preview = JSON.parse((await run(process.execPath, args)).stdout)
  assert.equal(preview.records[0].status, 'would-import')
  assert.deepEqual(await readFile(process.env.MHY_DATABASE_PATH), before)
  assert.equal(
    JSON.parse((await run(process.execPath, [...args, '--apply'])).stdout).records[0].status,
    'imported',
  )
  assert.equal(
    JSON.parse((await run(process.execPath, [...args, '--apply'])).stdout).records[0].status,
    'unchanged',
  )
  await db.MysUserDB.update({ stoken: 'v2_newer' }, { where: { ltuid: 100 } })
  assert.equal(
    JSON.parse((await run(process.execPath, [...args, '--apply'])).stdout).records[0].status,
    'conflict',
  )
  assert.equal(await readFile(sourceFile, 'utf8'), yaml)
  assert.equal((await db.MysUserDB.findByPk('100')).stoken, 'v2_newer')
})
