import { randomBytes } from 'node:crypto';
import { createDs } from './sign.js';
import { setTimeout as sleep } from 'node:timers/promises';
import QRCode from 'qrcode';
import fetch from './fetch.js';
import { getAccounts, saveLogin } from './accounts.js';
import { getLTokenBySToken } from './stoken.js';
const QR_APP_ID = 'bll8iq97cem8';
const APP_VERSION = '2.71.1';
const PASS_SALT = 'JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS';
const DS2_SALT_4X = 'xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs';
const POLL_INTERVAL_MS = 2_000;
const CREATE_QR_URL = 'https://passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin';
const QUERY_QR_URL = 'https://passport-api.mihoyo.com/account/ma-cn-passport/app/queryQRLoginStatus';
const COOKIE_BY_STOKEN_URL = 'https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken';
const GAME_ROLES_URL = 'https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie';
/** 将 Demo 请求转换为统一 fetch，保持原始响应。
 * @param url 请求地址
 * @param options 请求参数
 * @returns JSON 响应
 */
async function httpJson(url, options) {
    const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(10000)]),
    });
    if (!response.ok)
        throw new Error(`米游社请求失败：HTTP ${response.status}`);
    return { body: (await response.json()) };
}
/** 创建首次扫码所需的稳定设备身份。
 * @param signal 请求参数
 * @returns 操作结果
 */
function createState(signal) {
    const deviceId = randomBytes(16).toString('hex').toUpperCase();
    return {
        signal,
        device_id: deviceId,
        device_name: `Android-${deviceId.slice(0, 8)}`,
        device_model: deviceId.slice(0, 16),
    };
}
/** 校验业务响应码。
 * @param payload 原始响应
 * @param apiName 操作名称
 * @returns 无返回值
 */
function assertApiSuccess(payload, apiName) {
    if (payload.retcode !== 0) {
        throw new Error(`${apiName}失败: retcode=${payload.retcode}, message=${payload.message}`);
    }
}
/** 构造已验证的米游社 App 请求头。
 * @param state 请求参数
 * @param body 请求参数
 * @returns 操作结果
 */
function getPassportHeaders(state, body) {
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
        DS: createDs('', body, PASS_SALT),
        'x-rpc-sdk_version': '1.3.1.2',
        'User-Agent': 'okhttp/4.8.0',
        Connection: 'Keep-Alive',
        'Accept-Encoding': 'gzip, deflate, br',
        'x-rpc-channel': 'appstore',
    };
}
/** 使用最终请求体签名并发送 Passport 请求。
 * @param state 登录设备和取消信号
 * @param key 日志操作名
 * @param url 请求地址
 * @param body 请求对象
 * @returns 原始响应
 */
async function postPassport(state, key, url, body) {
    const bodyText = JSON.stringify(body);
    const result = await httpJson(url, {
        signal: state.signal,
        key,
        method: 'POST',
        headers: getPassportHeaders(state, bodyText),
        body: bodyText,
    });
    return result.body;
}
/** 创建 App 登录二维码。
 * @param state 请求参数
 * @returns 操作结果
 */
async function createQrLogin(state) {
    const payload = await postPassport(state, 'app_create_qr_login', CREATE_QR_URL, {});
    assertApiSuccess(payload, '创建 App 扫码二维码');
    if (!payload.data?.ticket || !payload.data?.url) {
        throw new Error('创建二维码成功响应中缺少 ticket 或 url');
    }
    return payload.data;
}
/** 查询二维码状态。
 * @param state 请求参数
 * @param ticket 请求参数
 * @returns 操作结果
 */
async function queryQrLoginStatus(state, ticket) {
    return postPassport(state, 'app_query_qr_login_status', QUERY_QR_URL, { ticket });
}
/** 等待确认并提取已验证的 SToken 响应字段。
 * @param state 请求参数
 * @param ticket 请求参数
 * @param onStatus 请求参数
 * @returns 操作结果
 */
async function waitForQrConfirmed(state, ticket, onStatus) {
    let previousStatus;
    while (true) {
        const payload = await queryQrLoginStatus(state, ticket);
        if (payload.retcode === -3501) {
            throw new Error('二维码已经过期，请重新扫码');
        }
        if (payload.retcode === -3505) {
            throw new Error('你在手机上取消了扫码登录');
        }
        assertApiSuccess(payload, '查询 App 扫码状态');
        if (payload.data.status !== previousStatus) {
            previousStatus = payload.data.status;
            await onStatus?.(payload.data.status);
        }
        if (payload.data.status === 'Confirmed') {
            const userInfo = payload.data.user_info;
            const accountId = String(userInfo?.aid || userInfo?.uid || userInfo?.account_id || '');
            const mid = userInfo?.mid;
            const tokenInfo = payload.data.tokens?.find((item) => item.name === 'stoken' || item.name === 'stoken_v2') ??
                payload.data.tokens?.[0];
            const stoken = tokenInfo?.token;
            if (!accountId || !mid || !stoken) {
                throw new Error(`扫码已确认，但没有拿到完整 SToken 信息: accountId=${accountId ?? '-'}, mid=${mid ?? '-'}, tokens=${payload.data.tokens?.length ?? 0}`);
            }
            return { accountId, mid, stoken };
        }
        await sleep(POLL_INTERVAL_MS, undefined, { signal: state.signal });
    }
}
/** 使用已验证的 SToken 兑换 CK。
 * @param state 登录会话
 * @param login 已确认凭据
 * @returns Cookie Token
 */
async function getCookieTokenBySToken(state, login) {
    const query = new URLSearchParams({
        game_biz: 'hk4e_cn',
        stoken: login.stoken,
        uid: login.accountId,
        mid: login.mid,
    });
    const url = `${COOKIE_BY_STOKEN_URL}?${query}`;
    const result = await httpJson(url, {
        signal: state.signal,
        key: 'get_cookie_token_by_stoken',
        headers: {
            Accept: 'application/json, text/plain, */*',
            'User-Agent': `Mozilla/5.0 miHoYoBBS/${APP_VERSION}`,
        },
    });
    const payload = result.body;
    assertApiSuccess(payload, '使用 SToken 获取 Cookie Token');
    const cookieToken = payload.data?.cookie_token;
    if (!cookieToken) {
        throw new Error('SToken 兑换成功响应中没有 cookie_token');
    }
    return cookieToken;
}
/** 按游戏查询绑定角色，保持 Demo 的请求结构。
 * @param state 登录会话
 * @param cookie 已兑换的完整 CK
 * @param gameBiz 游戏业务标识
 * @returns 角色列表
 */
async function getGenshinRoles(state, cookie, gameBiz) {
    const query = `game_biz=${gameBiz}`;
    const url = `${GAME_ROLES_URL}?${query}`;
    const result = await httpJson(url, {
        signal: state.signal,
        key: 'app_get_genshin_roles',
        headers: {
            Accept: 'application/json, text/plain, */*',
            Cookie: cookie,
            DS: createDs(query, '', DS2_SALT_4X),
            'User-Agent': `Mozilla/5.0 (Linux; Android 16; wv) AppleWebKit/537.36 ` +
                `Mobile Safari/537.36 miHoYoBBS/${APP_VERSION}`,
            'x-rpc-app_version': APP_VERSION,
            'x-rpc-client_type': '5',
            'x-rpc-device_id': state.device_id,
        },
    });
    const payload = result.body;
    assertApiSuccess(payload, '获取绑定原神账号');
    if (!Array.isArray(payload.data?.list))
        throw new Error('角色查询响应缺少 list');
    return payload.data.list;
}
const sessions = new Map();
/** 取消用户正在进行的扫码。
 * @param userId 用户 ID
 * @returns 是否存在会话
 */
export function cancelLogin(userId) {
    const previous = sessions.get(String(userId));
    previous?.controller.abort(new Error('扫码已取消或重新发起'));
    sessions.delete(String(userId));
    return !!previous;
}
/** 创建扫码会话和二维码图片。
 * @param userId 发起用户 ID
 * @returns 独立扫码会话
 */
export async function startLogin(userId) {
    userId = String(userId);
    cancelLogin(userId);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]);
    const session = { userId, controller, state: createState(signal) };
    sessions.set(userId, session);
    signal.addEventListener('abort', () => {
        if (sessions.get(userId) === session)
            sessions.delete(userId);
    }, { once: true });
    try {
        const account = (await getAccounts(userId)).find((item) => item.login_device);
        if (account?.login_device)
            Object.assign(session.state, JSON.parse(account.login_device));
        signal.throwIfAborted();
        session.qr = await createQrLogin(session.state);
        session.image = await QRCode.toBuffer(session.qr.url, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'M',
        });
        signal.throwIfAborted();
        return session;
    }
    catch (error) {
        controller.abort();
        throw error;
    }
}
/** 等待扫码确认，兑换凭据并原子保存三游戏绑定。
 * @param session 扫码会话
 * @param onStatus 状态变化提示
 * @returns 已保存账号及角色
 */
export async function waitForLogin(session, onStatus) {
    if (session.waiting)
        return session.waiting;
    session.waiting = (async () => {
        try {
            if (!session.qr)
                throw new Error('二维码尚未就绪');
            const state = session.state;
            const login = await waitForQrConfirmed(state, session.qr.ticket, onStatus);
            const ltoken = await getLTokenBySToken(login.accountId, login.stoken, login.mid, state.signal);
            const token = await getCookieTokenBySToken(state, login);
            const cookie = `ltoken=${ltoken}; ltuid=${login.accountId}; cookie_token=${token}; account_id=${login.accountId}`;
            const roles = [];
            for (const biz of ['hk4e_cn', 'hkrpg_cn', 'nap_cn'])
                roles.push(...(await getGenshinRoles(state, cookie, biz)));
            await saveLogin(session.userId, {
                ...login,
                cookie,
                roles,
                device: {
                    device_id: state.device_id,
                    device_name: state.device_name,
                    device_model: state.device_model,
                },
            }, state.signal);
            return { accountId: login.accountId, roles };
        }
        finally {
            if (sessions.get(session.userId) === session)
                sessions.delete(session.userId);
            session.controller.abort();
            session.image = undefined;
        }
    })();
    return session.waiting;
}
