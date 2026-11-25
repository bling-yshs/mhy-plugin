import { randomBytes, randomUUID } from 'node:crypto';
import { MysUserDB, UserDB, writeTransaction } from '../db/index.js';
import { accountUsers, getAccounts, resolveAccount } from './accounts.js';
import { notifyAccountChange } from './account-events.js';
import { getServer } from './request.js';
import { PASSPORT_SALT, createDs, createSignDs } from './sign.js';
import fetch from './fetch.js';
const EXCHANGE_URL = 'https://passport-api.mihoyo.com/account/ma-cn-session/app/exchange';
const COOKIE_BY_STOKEN_URL = 'https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken';
const PASSPORT_APP_ID = 'bll8iq97cem8';
const PASSPORT_APP_VERSION = '2.119.2';
const PASSPORT_SDK_VERSION = '2.44.0';
const DEVICE_FP = '38d7ee0e96649';
/** exchange 的 dst_token_type：2 为 ltoken_v2，4 为 cookie_token_v2。 */
const TOKEN_TYPE = { ltoken: 2, cookieToken: 4 };
/** 通行证 SDK 序列化时转义的字符。U+2028/U+2029 和反斜杠用码点构造，源码中不出现转义序列。 */
const PASSPORT_ESCAPE = new RegExp(`[<>&='${String.fromCharCode(0x2028, 0x2029)}]`, 'gu');
const BACKSLASH = String.fromCharCode(92);
const refreshing = new Set();
/** 请求凭据接口并校验 HTTP、业务状态及响应数据。
 * @param url 米游社接口地址
 * @param init 请求参数
 * @param label 面向用户的操作名称
 * @returns 接口返回的数据
 */
async function requestToken(url, init, label) {
    const response = await fetch(url, {
        ...init,
        signal: init.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
            : AbortSignal.timeout(15000),
    });
    if (!response.ok)
        throw new Error(`${label}失败：HTTP ${response.status}`);
    const payload = (await response.json());
    if (payload.retcode !== 0 || !payload.data)
        throw new Error(`${label}失败：返回码 ${payload.retcode}，请尝试重新扫码登录`);
    return payload.data;
}
/** 生成与扫码登录相同规则的 Android 设备信息。
 * @returns 设备信息
 */
function createDevice() {
    const deviceId = randomBytes(16).toString('hex').toUpperCase();
    return {
        device_id: deviceId,
        device_name: `Android-${deviceId.slice(0, 8)}`,
        device_model: deviceId.slice(0, 16),
    };
}
/** 读取账号保存的扫码设备，缺失或损坏时返回 undefined。
 * @param raw login_device 字段
 * @returns 设备信息
 */
function parseDevice(raw) {
    if (!raw)
        return undefined;
    try {
        const device = JSON.parse(raw);
        if (device.device_id && device.device_name && device.device_model)
            return device;
    }
    catch { }
    return undefined;
}
/** 从 Cookie 字符串中读取指定字段。
 * @param cookie Cookie 字符串
 * @param key 字段名
 * @returns 字段值，不存在时为 undefined
 */
function cookieValue(cookie, key) {
    for (const part of cookie.split(';')) {
        const separator = part.indexOf('=');
        if (separator > 0 && part.slice(0, separator).trim() === key)
            return part.slice(separator + 1).trim() || undefined;
    }
    return undefined;
}
/** 按通行证 SDK 的方式转义正文，签名和发送共用同一份字符串。
 * @param data 请求对象
 * @returns JSON 正文
 */
function passportBody(data) {
    return JSON.stringify(data).replace(PASSPORT_ESCAPE, (char) => `${BACKSLASH}u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
/** 用 SToken V2 通过通行证 exchange 兑换指定类型的 V2 凭据。
 * @param login 账号 ID、SToken 和 MID
 * @param target 目标凭据类型
 * @param device 请求使用的设备信息
 * @param lifecycleId 同一轮兑换共用的生命周期 ID
 * @param signal 取消信号
 * @returns 兑换得到的凭据
 */
async function exchangeToken(login, target, device, lifecycleId, signal) {
    const label = target === TOKEN_TYPE.ltoken ? '兑换 LToken' : '兑换 Cookie Token';
    const body = passportBody({
        dst_token_type: target,
        src_token: { token: login.stoken, token_type: 1 },
        mid: login.mid,
    });
    const data = await requestToken(EXCHANGE_URL, {
        method: 'POST',
        body,
        signal,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': `Mozilla/5.0 (Linux; Android 11; ${device.device_model}) miHoYoBBS/${PASSPORT_APP_VERSION}`,
            'x-rpc-app_version': PASSPORT_APP_VERSION,
            'x-rpc-client_type': '2',
            'x-rpc-app_id': PASSPORT_APP_ID,
            'x-rpc-device_id': device.device_id,
            'x-rpc-device_fp': DEVICE_FP,
            'x-rpc-device_name': encodeURIComponent(device.device_name),
            'x-rpc-device_model': device.device_model,
            'x-rpc-game_biz': 'bbs_cn',
            'x-rpc-sys_version': '11',
            'x-rpc-sdk_version': PASSPORT_SDK_VERSION,
            'x-rpc-account_version': PASSPORT_SDK_VERSION,
            'x-rpc-lifecycle_id': lifecycleId,
            DS: createDs('', body, PASSPORT_SALT),
        },
    }, label);
    const token = data.token;
    if (!token?.token || (token.token_type != null && Number(token.token_type) !== target))
        throw new Error(`${label}失败：响应缺少 V2 凭据，请重新扫码登录`);
    if (data.user_info?.aid != null && String(data.user_info.aid) !== login.accountId)
        throw new Error(`${label}失败：返回的账号与绑定账号不一致`);
    return token.token;
}
/** 用 SToken 兑换登录 CK。有 MID 时换 V2 的 LToken 和 Cookie Token；
 * 缺 MID 的旧账号只能用 V1 接口换 Cookie Token，LToken 沿用原 CK 中的值。
 * @param login 账号 ID、SToken、MID，旧账号另需原 LToken
 * @param device 请求使用的设备信息，缺省时临时生成
 * @param signal 取消信号
 * @returns 可直接保存的 CK
 */
export async function exchangeCookieBySToken(login, device = createDevice(), signal) {
    const { accountId, mid } = login;
    if (mid) {
        const lifecycleId = randomUUID();
        const v2 = { ...login, mid };
        const ltoken = await exchangeToken(v2, TOKEN_TYPE.ltoken, device, lifecycleId, signal);
        const cookieToken = await exchangeToken(v2, TOKEN_TYPE.cookieToken, device, lifecycleId, signal);
        return [
            `ltoken_v2=${ltoken}`,
            `ltuid_v2=${accountId}`,
            `ltmid_v2=${mid}`,
            `cookie_token_v2=${cookieToken}`,
            `account_id_v2=${accountId}`,
            `account_mid_v2=${mid}`,
            `account_id=${accountId}`,
            `ltuid=${accountId}`,
        ].join('; ');
    }
    if (!login.ltoken)
        throw new Error('账号缺少 MID 和 LToken，请重新扫码登录');
    const query = new URLSearchParams({ game_biz: 'hk4e_cn', uid: accountId, stoken: login.stoken });
    const data = await requestToken(`${COOKIE_BY_STOKEN_URL}?${query}`, {
        headers: {
            Cookie: `stuid=${accountId};stoken=${login.stoken};`,
            'User-Agent': 'Mozilla/5.0 miHoYoBBS/2.71.1',
        },
        signal,
    }, '获取 cookie_token');
    if (!data.cookie_token)
        throw new Error('响应缺少 cookie_token，请重新扫码登录');
    return `ltoken=${login.ltoken}; ltuid=${accountId}; cookie_token=${data.cookie_token}; account_id=${accountId}`;
}
/** 用发送者已绑定账号的 SToken 兑换 LToken 和 Cookie Token，并刷新兼容缓存。
 * @param userId 发送者的主用户 ID
 * @returns 各账号的刷新结果
 */
export async function refreshUserCookies(userId) {
    const accounts = await getAccounts(userId);
    if (!accounts.length)
        return ['请先发送 #扫码登录 绑定米游社账号'];
    const results = [];
    for (const account of accounts) {
        const accountId = String(account.ltuid);
        if (!account.stoken) {
            results.push(`账号 ${accountId}：缺少 stoken，请重新扫码登录`);
            continue;
        }
        if (refreshing.has(accountId)) {
            results.push(`账号 ${accountId}：正在刷新，请稍后再试`);
            continue;
        }
        refreshing.add(accountId);
        try {
            const ck = await exchangeCookieBySToken({
                accountId,
                stoken: account.stoken,
                mid: account.mid,
                ltoken: cookieValue(account.ck || '', 'ltoken'),
            }, parseDevice(account.login_device));
            await writeTransaction(async (transaction) => {
                const current = await MysUserDB.findByPk(accountId, { transaction });
                const user = await UserDB.findByPk(userId, { transaction });
                if (!user?.ltuids.split(',').includes(accountId) ||
                    !current ||
                    current.stoken !== account.stoken ||
                    current.mid !== account.mid ||
                    current.ck !== account.ck)
                    throw new Error('账号绑定或凭据已变更，请重新执行刷新');
                await current.update({ ck }, { transaction, fields: ['ck'] });
            });
            await notifyAccountChange({ accountId, userIds: await accountUsers(accountId) });
            results.push(`账号 ${accountId}：CK 刷新成功`);
        }
        catch (error) {
            results.push(`账号 ${accountId}：${error instanceof Error ? error.message : '刷新失败，请稍后重试'}`);
        }
        finally {
            refreshing.delete(accountId);
        }
    }
    return results;
}
/** 用当前原神角色所属账号的 SToken 生成抽卡记录导入链接。
 * @param userId 发送者的主用户 ID
 * @returns 角色 UID 和供 genshin 导入的链接
 */
export async function getGachaImportUrl(userId) {
    const user = await UserDB.findByPk(userId);
    const account = await resolveAccount(userId, 'gs');
    if (!account?.stoken)
        throw new Error('当前原神账号缺少 stoken，请先发送 #扫码登录');
    const selectedUid = user?.games.gs?.uid;
    const uid = (selectedUid && account.uids.gs?.includes(selectedUid) ? selectedUid : account.uids.gs?.[0]) ||
        '';
    if (!uid)
        throw new Error('该账号没有绑定原神角色');
    const region = getServer(uid, 'gs');
    if (!['cn_gf01', 'cn_qd01'].includes(region))
        throw new Error('当前扫码账号仅支持国服原神抽卡记录更新');
    const body = JSON.stringify({
        auth_appid: 'webview_gacha',
        game_biz: 'hk4e_cn',
        game_uid: Number(uid),
        region,
    });
    const data = await requestToken('https://api-takumi.mihoyo.com/binding/api/genAuthKey', {
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
    }, '获取抽卡记录授权');
    if (!data.authkey)
        throw new Error('响应缺少 authkey，请重新扫码登录');
    const params = new URLSearchParams({
        authkey: data.authkey,
        authkey_ver: '1',
        sign_type: '2',
        auth_appid: 'webview_gacha',
        game_biz: 'hk4e_cn',
        region,
        lang: 'zh-cn',
    });
    return {
        uid,
        url: `https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog?${params}`,
    };
}
