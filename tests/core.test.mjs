import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

const directory = await mkdtemp(path.join(tmpdir(), 'mhy-test-'))
process.env.MHY_DATABASE_PATH = path.join(directory, 'accounts.sqlite')
const db = await import('../dist/db/index.js')
await db.MysUserDB.create({
  ltuid: 100,
  type: 'mys',
  ck: 'ltuid=100;cookie_token=old',
  device: 'device-100',
  uids: { gs: ['100000001'] },
})
const api = await import('../dist/api.js')
const originalFetch = globalThis.fetch
const cache = new Map()
globalThis.redis = {
  get: async (key) => cache.get(key),
  setEx: async (key, _ttl, value) => cache.set(key, value),
}
globalThis.logger = { error() {}, mark() {} }
beforeEach(() => {
  cache.clear()
  globalThis.fetch = async () => {
    throw new Error('Unexpected network request')
  }
})
after(async () => {
  globalThis.fetch = originalFetch
  await db.sequelize.close()
})

/** 创建标准模拟 HTTP 响应。
 * @param {object} data 业务数据
 * @returns {Response} JSON 响应
 */
function response(data) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

test('登录事务保存三游戏角色，旧模型保存保留新凭据', async () => {
  const login = {
    accountId: '101',
    mid: 'mid101',
    stoken: 'v2_test',
    cookie: 'ltuid=101;cookie_token=new',
    device: { device_id: 'login101', device_name: 'Android', device_model: 'Test' },
    roles: [
      { game_biz: 'hk4e_cn', game_uid: '100000002', region: 'cn_gf01' },
      { game_biz: 'hkrpg_cn', game_uid: '100000003', region: 'prod_gf_cn' },
      { game_biz: 'nap_cn', game_uid: '10000004', region: 'prod_gf_cn' },
    ],
  }
  await api.saveLogin('qq101', login)
  assert.equal((await api.resolveAccount('qq101', 'zzz')).ltuid, 101)
  const account = await db.MysUserDB.findByPk('101')
  await account.saveDB({
    ck: account.ck,
    device: account.device,
    type: 'mys',
    uids: account.uids,
    db: account,
  })
  assert.equal((await db.MysUserDB.findByPk('101')).stoken, 'v2_test')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(api.saveLogin('qq101', { ...login, cookie: 'bad' }, controller.signal))
  assert.equal((await db.MysUserDB.findByPk('101')).ck, login.cookie)
})

test('共享账号解绑仅移除当前用户关联', async () => {
  await db.UserDB.create({ id: 'sharedA', ltuids: '100', games: {} })
  await db.UserDB.create({ id: 'sharedB', ltuids: '100', games: {} })
  assert.equal(await api.unlinkAccount('sharedA', '100'), false)
  assert.ok(await db.MysUserDB.findByPk('100'))
  assert.equal(await api.ownsAccount('sharedB', '100'), true)
})

test('绑定设备按账号共享并检查用户归属', async () => {
  await api.bindDevice('qq101', '101', { device_id: 'bound101', device_fp: 'fp101' })
  assert.equal((await api.ensureDevice('101')).device_id, 'bound101')
  await assert.rejects(
    api.bindDevice('other', '101', { device_id: 'bad', device_fp: 'bad' }),
    /账号绑定/,
  )
})

test('首批三游戏请求保持响应结构且 DS 使用最终参数', async () => {
  const payload = {
    retcode: 0,
    message: 'OK',
    data: {
      list: [{ id: 10000021, values: [0, null, '1.0'], extra: { kept: true } }],
      avatar_list: [{ id: 1001 }],
      property_map: {},
      unknown_field: 7,
    },
    extra_top: 'preserve',
  }
  const cases = [
    ['characterDetail', 'gs', { character_ids: [10000021] }, '/character/detail'],
    ['avatarInfo', 'sr', {}, '/avatar/info'],
    ['zzzAvatarInfo', 'zzz', { query: { id_list: [1011, 1021] } }, '/avatar/info'],
    ['zzzExplorationDetail', 'zzz', {}, '/exploration_detail'],
    ['dailyNote', 'gs', {}, '/dailyNote'],
    ['index', 'sr', {}, '/index'],
  ]
  for (const [type, game, params, suffix] of cases) {
    globalThis.fetch = async (input, init) => {
      const url = new URL(input)
      assert.ok(url.pathname.endsWith(suffix))
      const headers = new Headers(init.headers)
      assert.equal(headers.get('x-rpc-device_id'), 'bound101')
      assert.equal(headers.get('Cookie'), 'ltuid=101;cookie_token=new')
      const [t, r, hash] = headers.get('DS').split(',')
      assert.equal(
        hash,
        createHash('md5')
          .update(
            `salt=xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs&t=${t}&r=${r}&b=${init.body || ''}&q=${url.search.slice(1)}`,
          )
          .digest('hex'),
      )
      if (type === 'zzzAvatarInfo')
        assert.deepEqual(url.searchParams.getAll('id_list[]'), ['1011', '1021'])
      return response(payload)
    }
    assert.deepEqual(
      await api.execute(
        type,
        { game, uid: '100000002', cookie: 'ltuid=101;cookie_token=stale' },
        params,
      ),
      payload,
    )
  }
})

test('指纹并发刷新合并，解绑后旧刷新结果无法覆盖', async () => {
  const android = {
    deviceName: 'test',
    deviceBoard: 'board',
    deviceModel: 'model',
    oaid: 'id',
    androidVersion: '12',
    deviceFingerprint: 'test/test/test/1',
    deviceProduct: 'test',
  }
  await db.MysUserDB.update(
    { bound_device: JSON.stringify({ device_id: 'expired', android, expiresAt: 0 }) },
    { where: { ltuid: 101 } },
  )
  let release
  let started
  const ready = new Promise((resolve) => {
    started = resolve
  })
  let count = 0
  globalThis.fetch = async () => {
    count++
    started()
    return await new Promise((resolve) => {
      release = () => resolve(response({ retcode: 0, data: { device_fp: 'new' } }))
    })
  }
  const first = api.ensureDevice('101')
  await ready
  const second = api.ensureDevice('101')
  await api.unbindDevice('qq101', '101')
  const rejected = Promise.all([assert.rejects(first, /已变更/), assert.rejects(second, /已变更/)])
  release()
  await rejected
  assert.equal(count, 1)
  assert.equal(await api.getBoundDevice('101'), undefined)
})

test('扫码确认、三游戏角色查询和重启读取所需凭据闭环', async () => {
  const calls = []
  globalThis.fetch = async (input) => {
    const url = new URL(input)
    calls.push(url.pathname)
    if (url.pathname.endsWith('createQRLogin'))
      return response({ retcode: 0, data: { url: 'https://test.invalid/qr', ticket: 'ticket' } })
    if (url.pathname.endsWith('queryQRLoginStatus'))
      return response({
        retcode: 0,
        data: {
          status: 'Confirmed',
          tokens: [{ name: 'stoken', token: 'v2_scan' }],
          user_info: { aid: '102', mid: 'mid102' },
        },
      })
    if (url.pathname.endsWith('getCookieAccountInfoBySToken'))
      return response({ retcode: 0, data: { cookie_token: 'scan-cookie' } })
    if (url.pathname.endsWith('getLTokenBySToken'))
      return response({ retcode: 0, data: { ltoken: 'l_scan' } })
    return response({
      retcode: 0,
      data: {
        list: [
          { game_biz: url.searchParams.get('game_biz'), game_uid: '100000005', region: 'cn_gf01' },
        ],
      },
    })
  }
  const session = await api.startLogin('qq102')
  assert.ok(Buffer.isBuffer(session.image))
  const result = await api.waitForLogin(session)
  assert.equal(result.roles.length, 3)
  const account = await db.MysUserDB.findByPk('102')
  assert.equal(account.stoken, 'v2_scan')
  assert.match(account.ck, /(?:^|;)\s*ltoken=l_scan(?:;|$)/)
  assert.equal(calls.filter((url) => url.endsWith('getUserGameRolesByCookie')).length, 3)
})

test('重复扫码取消旧会话，不同用户会话独立', async () => {
  globalThis.fetch = async () =>
    response({ retcode: 0, data: { url: 'https://test.invalid/qr', ticket: 'ticket' } })
  const oldSession = await api.startLogin('concurrent')
  const other = await api.startLogin('other')
  const current = await api.startLogin('concurrent')
  assert.equal(oldSession.state.signal.aborted, true)
  assert.equal(other.state.signal.aborted, false)
  assert.equal(current.state.signal.aborted, false)
  api.cancelLogin('concurrent')
  api.cancelLogin('other')
})

test('旧模型首次创建用户和账号时保留原主键', async () => {
  const mys = await db.MysUserDB.find('987654', true)
  await mys.saveDB({
    ck: 'ltuid=987654;cookie_token=test',
    device: 'legacy-device',
    type: 'mys',
    uids: { gs: ['100000009'] },
    db: mys,
  })
  const user = await db.UserDB.find('legacy-user')
  await user.saveDB({
    mysUsers: {
      987654: { ltuid: 987654, ck: mys.ck, device: mys.device, type: 'mys', uids: mys.uids },
    },
    _games: { gs: { uid: '100000009', data: {} } },
  })
  assert.ok(await db.MysUserDB.findByPk('987654'))
  assert.equal((await db.UserDB.findByPk('legacy-user')).ltuids, '987654')
})

test('首次绑定进行中解绑，旧网络结果不会重新绑定设备', async () => {
  const android = {
    deviceName: 'test',
    deviceBoard: 'board',
    deviceModel: 'model',
    oaid: 'id',
    androidVersion: '12',
    deviceFingerprint: 'test/test/test/1',
    deviceProduct: 'test',
  }
  let release
  let started
  const ready = new Promise((resolve) => {
    started = resolve
  })
  globalThis.fetch = async () => {
    started()
    return new Promise((resolve) => {
      release = () => resolve(response({ retcode: 0, data: { device_fp: 'late' } }))
    })
  }
  const pending = api.bindDevice('legacy-user', '987654', android)
  await ready
  await api.unbindDevice('legacy-user', '987654')
  const rejected = assert.rejects(pending, /已变更/)
  release()
  await rejected
  assert.equal(await api.getBoundDevice('987654'), undefined)
})

test('扫码过期和角色查询失败保持旧凭据', async () => {
  globalThis.fetch = async (input) =>
    String(input).endsWith('createQRLogin')
      ? response({ retcode: 0, data: { url: 'https://test.invalid/qr', ticket: 'expired' } })
      : response({ retcode: -3501, message: 'expired' })
  const expired = await api.startLogin('qq102')
  await assert.rejects(api.waitForLogin(expired), /过期/)
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('createQRLogin'))
      return response({ retcode: 0, data: { url: 'https://test.invalid/qr', ticket: 'failed' } })
    if (url.endsWith('queryQRLoginStatus'))
      return response({
        retcode: 0,
        data: {
          status: 'Confirmed',
          tokens: [{ name: 'stoken', token: 'bad-new-token' }],
          user_info: { aid: '102', mid: 'mid102' },
        },
      })
    if (url.includes('getCookieAccountInfoBySToken'))
      return response({ retcode: 0, data: { cookie_token: 'new' } })
    if (url.endsWith('getLTokenBySToken'))
      return response({ retcode: 0, data: { ltoken: 'l_new' } })
    return response({ retcode: -100, message: 'invalid', data: {} })
  }
  const failed = await api.startLogin('qq102')
  await assert.rejects(api.waitForLogin(failed), /获取绑定原神账号失败/)
  assert.equal((await db.MysUserDB.findByPk('102')).stoken, 'v2_scan')
})

test('国际服路由与业务验证码原样保留', async () => {
  await api.bindDevice('qq101', '101', { device_id: 'bound101', device_fp: 'fp101' })
  const payload = {
    retcode: 1034,
    message: 'verify',
    data: null,
    aigis_data: { challenge: 'test' },
  }
  globalThis.fetch = async (input) => {
    assert.equal(new URL(input).hostname, 'sg-act-public-api.hoyolab.com')
    return response(payload)
  }
  assert.deepEqual(
    await api.execute('zzzNote', { game: 'zzz', uid: '1300000001', cookie: 'ltuid=101;x=1' }),
    payload,
  )
})
