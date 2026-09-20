import { createHash } from 'node:crypto';
import fetch from './fetch.js';
import { createDs } from './sign.js';
import { accountIdFromCookie, resolveAccount } from './accounts.js';
import { MysUserDB } from '../db/index.js';
import { ensureDevice, refreshDevice, registerDeviceSession } from './devices.js';
const aliases = {
    zzzNote: 'dailyNote',
    zzzIndex: 'index',
    zzzAvatarList: 'character',
    zzzBuddyList: 'buddy',
};
const core = new Set([
    'index',
    'dailyNote',
    'character',
    'characterDetail',
    'avatarInfo',
    'basicInfo',
    'zzzAvatarInfo',
    'zzzExplorationDetail',
    'buddy',
    'getFp',
    'zzzUser',
]);
const fingerprints = new Map();
/** 判断旧操作是否属于当前迁移范围。
 * @param operation 原有操作名
 * @returns 是否接管
 */
export function handlesOperation(operation) {
    return core.has(aliases[operation] || operation);
}
/** 根据旧 UID 规则确定区服。
 * @param uid 游戏 UID
 * @param game 游戏标识
 * @returns 区服
 */
export function getServer(uid, game) {
    if (game === 'zzz')
        return uid.length < 10
            ? 'prod_gf_cn'
            : { '10': 'prod_gf_us', '15': 'prod_gf_eu', '13': 'prod_gf_jp', '17': 'prod_gf_sg' }[uid.slice(0, -8)] || 'prod_gf_cn';
    const index = { '5': 1, '6': 2, '7': 3, '8': 4, '18': 4, '9': 5 }[uid.slice(0, -8)] || 0;
    return (game === 'gs'
        ? ['cn_gf01', 'cn_qd01', 'os_usa', 'os_euro', 'os_asia', 'os_cht']
        : [
            'prod_gf_cn',
            'prod_qd_cn',
            'prod_official_usa',
            'prod_official_euro',
            'prod_official_asia',
            'prod_official_cht',
        ])[index];
}
/** 构造类型明确的游戏查询，响应数据原样交还调用方。
 * @param operation 游戏操作名
 * @param context 账号和角色上下文
 * @param params 接口参数
 * @returns 完整米哈游响应
 */
export async function request(operation, context, params) {
    return execute(operation, context, params);
}
/** 发送兼容端点，统一签名、凭据及设备管理。
 * @param operation 原插件接口名
 * @param context 角色与账号上下文
 * @param params 原接口参数
 * @returns 未转换的原始响应
 */
export async function execute(operation, context, params = {}) {
    const op = aliases[operation] || operation;
    if (!core.has(op))
        throw new Error(`尚未接管接口：${operation}`);
    const game = context.game;
    const uid = String(context.uid);
    const server = context.server || getServer(uid, game);
    const cn = /cn_|_cn/.test(server);
    const suppliedId = accountIdFromCookie(context.cookie);
    if (context.accountId && suppliedId && String(context.accountId) !== suppliedId)
        throw new Error('请求账号与 Cookie 归属不一致');
    let account = context.accountId || suppliedId
        ? await MysUserDB.findByPk(context.accountId || suppliedId)
        : undefined;
    if (!account && context.userId && !context.cookie)
        account = await resolveAccount(context.userId, game);
    const cookie = account?.ck || context.cookie;
    if (!cookie)
        throw new Error('请先绑定米游社账号');
    const accountId = account ? String(account.ltuid) : suppliedId;
    let device = accountId ? await ensureDevice(accountId) : undefined;
    if (!device) {
        const deviceId = account?.device ||
            context.device ||
            `Yz-${createHash('md5')
                .update(accountId || uid)
                .digest('hex')
                .slice(0, 16)}`;
        const key = `${cn}:${deviceId}`;
        const cached = fingerprints.get(key);
        if (cached && cached.expires > Date.now())
            device = cached.device;
        else {
            device = await refreshDevice({
                device_id: deviceId,
                android: {
                    deviceName: 'J9110',
                    deviceBoard: 'msmnile',
                    deviceModel: 'J9110',
                    oaid: deviceId,
                    androidVersion: '11',
                    deviceFingerprint: 'Sony/J9110/J9110:11/55.2.A.4.332/055002A004033203408384484:user/release-keys',
                    deviceProduct: 'J9110',
                },
            }, !cn);
            fingerprints.set(key, { device, expires: Date.now() + 7 * 86400000 });
        }
    }
    if (op === 'getFp') {
        if (context.profile === 'zzz' && cn)
            await registerDeviceSession(cookie, device);
        return { retcode: 0, message: 'OK', data: { device_fp: device.device_fp } };
    }
    const zzzProfile = context.profile === 'zzz' || operation.startsWith('zzz');
    const host = cn
        ? 'https://api-takumi-record.mihoyo.com'
        : game === 'zzz'
            ? zzzProfile
                ? 'https://sg-act-public-api.hoyolab.com'
                : 'https://sg-act-nap-api.hoyolab.com'
            : 'https://bbs-api-os.hoyolab.com';
    let prefix = game === 'zzz'
        ? '/event/game_record_zzz/api/zzz'
        : `/game_record/app/${game === 'gs' ? 'genshin' : 'hkrpg'}/api`;
    const paths = {
        index: 'index',
        dailyNote: game === 'gs' ? 'dailyNote' : 'note',
        character: game === 'gs' ? 'character/list' : 'avatar/basic',
        characterDetail: 'character/detail',
        avatarInfo: 'avatar/info',
        basicInfo: game === 'gs' ? 'gcg/basicInfo' : 'role/basicInfo',
        zzzAvatarInfo: 'avatar/info',
        zzzExplorationDetail: 'exploration_detail',
        buddy: 'buddy/info',
    };
    const query = new URLSearchParams();
    if ((zzzProfile && op !== 'dailyNote' && op !== 'zzzExplorationDetail') ||
        (!cn && game === 'zzz' && op !== 'dailyNote'))
        query.set('lang', 'zh-cn');
    if (op === 'avatarInfo')
        query.set('need_wiki', String(params.need_wiki ?? true));
    if (op === 'zzzExplorationDetail') {
        query.set('uid', uid);
        query.set('region', server);
    }
    else {
        query.set('role_id', uid);
        query.set('server', server);
    }
    if (op === 'zzzAvatarInfo')
        query.set('need_wiki', String(params.need_wiki ?? false));
    if (params.avatar_list_type !== undefined)
        query.set('avatar_list_type', String(params.avatar_list_type));
    if (params.id_list)
        for (const id of params.id_list)
            query.append('id_list[]', String(id));
    if (params.query) {
        const entries = typeof params.query === 'string'
            ? new URLSearchParams(params.query)
            : Object.entries(params.query);
        for (const [key, value] of entries) {
            if (value === undefined)
                continue;
            if (Array.isArray(value)) {
                query.delete(key);
                query.delete(`${key}[]`);
                for (const item of value)
                    query.append(`${key}[]`, String(item));
            }
            else
                query.set(key, value === null ? '' : String(value));
        }
    }
    let body = '';
    if (game === 'gs' && (op === 'character' || op === 'characterDetail')) {
        if (op === 'characterDetail' && !Array.isArray(params.character_ids))
            throw new Error('缺少 character_ids');
        body = JSON.stringify({
            role_id: uid,
            server,
            ...(op === 'characterDetail' ? { character_ids: params.character_ids } : {}),
        });
        for (const key of [...query.keys()])
            query.delete(key);
    }
    let url = `${host}${prefix}/${paths[op]}`;
    if (op === 'zzzUser') {
        prefix = cn ? 'https://api-takumi.mihoyo.com' : 'https://sg-public-api.hoyolab.com';
        url = `${prefix}/binding/api/getUserGameRolesByCookie`;
        for (const key of [...query.keys()])
            query.delete(key);
        query.set('game_biz', cn ? 'nap_cn' : 'nap_global');
        query.set('region', server);
        query.set('game_uid', uid);
    }
    const q = query.toString();
    const version = zzzProfile ? (cn ? '2.73.1' : '2.57.1') : cn ? '2.40.1' : '2.55.0';
    const headers = new Headers(params.headers);
    headers.set('Cookie', cookie);
    headers.set('x-rpc-app_version', version);
    headers.set('x-rpc-client_type', zzzProfile || !cn ? '2' : '5');
    headers.set('x-rpc-device_id', device.device_id);
    if (device.device_fp)
        headers.set('x-rpc-device_fp', device.device_fp);
    if (!headers.has('User-Agent'))
        headers.set('User-Agent', `Mozilla/5.0 (Linux; Android ${device.android?.androidVersion || '12'}; ${device.android?.deviceModel || device.device_id}) AppleWebKit/537.36 Mobile Safari/537.36 ${cn ? 'miHoYoBBS' : 'miHoYoBBSOversea'}/${version}`);
    headers.set('Referer', cn
        ? zzzProfile
            ? 'https://act.mihoyo.com/'
            : 'https://webstatic.mihoyo.com/'
        : 'https://act.hoyolab.com/');
    if (zzzProfile) {
        headers.set('Origin', cn ? 'https://act.mihoyo.com' : 'https://act.hoyolab.com');
        headers.set('x-rpc-sys_version', device.android?.androidVersion || '12');
        headers.set('x-rpc-channel', 'mihoyo');
        if (device.android) {
            headers.set('x-rpc-device_name', `${device.android.deviceFingerprint?.split('/')[0]} ${device.android.deviceModel}`);
            headers.set('x-rpc-device_model', device.android.deviceModel);
            headers.set('x-rpc-csm_source', 'myself');
        }
    }
    headers.set('DS', createDs(q, body, cn ? undefined : 'okr4obncj8bw5a65hbnn5oo6ixjc3l9w'));
    if (body)
        headers.set('Content-Type', 'application/json');
    const signal = context.signal
        ? AbortSignal.any([context.signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000);
    const response = await fetch(q ? `${url}?${q}` : url, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body || undefined,
        signal,
    });
    if (!response.ok)
        throw new Error(`米游社请求失败：HTTP ${response.status}`);
    return (await response.json());
}
/** 兼容原神 getData 的缓存和 api 字段，保留完整响应。
 * @param api 旧请求实例
 * @param type 旧操作名
 * @param data 旧参数
 * @param cached 是否写查询缓存
 * @returns 原响应或 false
 */
export async function legacyGetData(api, type, data = {}, cached = false) {
    const game = type.startsWith('zzz') ? 'zzz' : api.game || 'gs';
    const account = await MysUserDB.findByPk(accountIdFromCookie(api.cookie) || '0');
    const hash = createHash('sha256')
        .update(JSON.stringify([game, api.uid, type, data, account?.ck || api.cookie, account?.bound_device]))
        .digest('hex');
    const cacheKey = `mhy:query:${hash}`;
    try {
        const hit = globalThis.redis && (await redis.get(cacheKey));
        if (hit)
            return JSON.parse(hit);
        const result = await execute(type, {
            game,
            uid: String(api.uid),
            server: api.server,
            cookie: api.cookie,
            device: api._device,
            profile: type.startsWith('zzz') ? 'zzz' : 'genshin',
        }, data);
        result.api = type;
        if (cached && result.retcode === 0 && globalThis.redis)
            await redis.setEx(cacheKey, api.cacheCd || 300, JSON.stringify(result));
        return result;
    }
    catch (error) {
        ;
        (globalThis.logger || console).error(`[mhy-plugin] ${type} 请求失败：${error instanceof Error ? error.message : '未知错误'}`);
        return false;
    }
}
/** 查询账号角色列表并保留原响应结构。
 * @param cookie 米游社 Cookie
 * @param serv 国服或国际服
 * @returns 完整角色响应或 false
 */
export async function getGameRoles(cookie, serv = 'mys') {
    const url = `${serv === 'hoyolab' ? 'https://sg-public-api.hoyolab.com' : 'https://api-takumi.mihoyo.com'}/binding/api/getUserGameRolesByCookie`;
    const response = await fetch(url, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(10000),
    });
    return response.ok ? (await response.json()) : false;
}
