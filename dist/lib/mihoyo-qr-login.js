import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import QRCode from 'qrcode';
import fetch from './fetch.js';
import { getAccounts, saveLogin } from './accounts.js';
export const QR_IMAGE_SIZE = 500;
const PASSPORT = 'https://passport-api.mihoyo.com';
const WEB_QR = PASSPORT + '/account/ma-cn-passport/web';
const QR_APP_ID = 'cie2gjc0sg00';
const WEB_REFERRER = 'https://user.mihoyo.com/login-platform/index.html?app_id=' + QR_APP_ID +
    '&theme=ys&token_type=2&game_biz=hk4e_cn&message_origin=https%253A%252F%252Fact.mihoyo.com' +
    '&succ_back_type=message%253Alogin-platform%253Alogin-success&fail_back_type=message%253Alogin-platform%253Alogin-fail&ux_mode=popup&iframe_level=1#/login/qr';
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const POLL_INTERVAL_MS = 2_000;
const ACCOUNT_COOKIES = ['ltoken_v2', 'ltuid_v2', 'ltmid_v2', 'cookie_token_v2', 'account_id_v2', 'account_mid_v2', 'account_id', 'ltuid'];
/** 创建网页扫码会话，使用原有的设备标识生成规则。
 * @param signal 会话取消信号
 * @returns 网页设备信息与会话 Cookie
 */
function createState(signal) {
    const deviceId = randomBytes(16).toString('hex').toUpperCase();
    return {
        signal,
        device_id: deviceId,
        device_name: `Android-${deviceId.slice(0, 8)}`,
        device_model: deviceId.slice(0, 16),
        lifecycleId: randomBytes(5).toString('hex'),
        cookies: new Map(),
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
/**
 * 发送网页扫码请求，并保留通行证在创建和轮询过程中下发的 Cookie。
 * @param state 扫码会话
 * @param action 网页通行证操作
 * @param body 请求正文
 * @returns 通行证业务响应
 */
async function postPassport(state, action, body) {
    const response = await fetch(`${WEB_QR}/${action}`, {
        method: 'POST',
        signal: AbortSignal.any([state.signal, AbortSignal.timeout(10000)]),
        headers: {
            Origin: 'https://user.mihoyo.com',
            Referer: 'https://user.mihoyo.com/',
            'Content-Type': 'application/json',
            'User-Agent': WEB_UA,
            'x-rpc-app_id': QR_APP_ID,
            'x-rpc-client_type': '4',
            'x-rpc-game_biz': 'hk4e_cn',
            'x-rpc-sdk_version': '2.57.0',
            'x-rpc-device_id': state.device_id,
            'x-rpc-device_name': state.device_name,
            'x-rpc-device_model': encodeURIComponent(state.device_model),
            'x-rpc-device_os': 'Windows%2010%2064-bit',
            'x-rpc-lifecycle_id': state.lifecycleId,
            'x-rpc-mi_referrer': WEB_REFERRER,
            Cookie: Array.from(state.cookies, ([key, value]) => `${key}=${value}`).join('; '),
        },
        body: JSON.stringify(body),
    });
    if (!response.ok)
        throw new Error(`米游社扫码请求失败：HTTP ${response.status}`);
    for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator < 1)
            continue;
        const key = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value)
            state.cookies.set(key, value);
        else
            state.cookies.delete(key);
    }
    return (await response.json());
}
/** 等待手机确认，读取网页版登录 Cookie。
 * @param state 扫码会话
 * @param ticket 二维码票据
 * @param onStatus 状态变化回调
 * @returns 米游社账号、MID 和 V2 Cookie
 */
async function waitForQrConfirmed(state, ticket, onStatus) {
    let previousStatus;
    while (true) {
        const payload = await postPassport(state, 'queryQRLoginStatus', { ticket });
        if (payload.retcode === -3501) {
            throw new Error('二维码已经过期，请重新扫码');
        }
        if (payload.retcode === -3505) {
            throw new Error('你在手机上取消了扫码登录');
        }
        assertApiSuccess(payload, '查询网页扫码状态');
        if (payload.data.status !== previousStatus) {
            previousStatus = payload.data.status;
            await onStatus?.(payload.data.status);
        }
        if (payload.data.status === 'Confirmed') {
            const accountId = String(payload.data.user_info?.aid || '');
            const mid = payload.data.user_info?.mid;
            const cookies = state.cookies;
            if (!accountId || !mid || !cookies.get('ltoken_v2') || !cookies.get('cookie_token_v2'))
                throw new Error('扫码已确认，响应缺少账号信息或 V2 登录凭据');
            if (cookies.get('ltuid_v2') !== accountId || cookies.get('account_id_v2') !== accountId ||
                cookies.get('ltmid_v2') !== mid || cookies.get('account_mid_v2') !== mid)
                throw new Error('扫码响应中的 Cookie 与账号信息不一致');
            const cookie = ACCOUNT_COOKIES.filter(key => cookies.has(key))
                .map(key => `${key}=${cookies.get(key)}`).join('; ');
            return { accountId, mid, cookie };
        }
        await sleep(POLL_INTERVAL_MS, undefined, { signal: state.signal });
    }
}
/**
 * 使用网页 LToken 查询指定游戏的绑定角色。
 * @param state 扫码会话
 * @param cookie 网页登录 Cookie
 * @param gameBiz 游戏业务标识
 * @returns 账号的游戏角色列表
 */
async function getGenshinRoles(state, cookie, gameBiz) {
    const url = `${PASSPORT}/binding/api/getUserGameRolesByLtoken?game_biz=${gameBiz}`;
    const response = await fetch(url, {
        signal: AbortSignal.any([state.signal, AbortSignal.timeout(10000)]),
        headers: { Cookie: cookie, Origin: 'https://act.mihoyo.com', Referer: 'https://act.mihoyo.com/', 'x-rpc-language': 'zh-cn' },
    });
    if (!response.ok)
        throw new Error(`查询绑定角色失败：HTTP ${response.status}`);
    const payload = (await response.json());
    assertApiSuccess(payload, '查询绑定角色');
    if (!Array.isArray(payload.data?.list))
        throw new Error('角色查询响应缺少 list');
    return payload.data.list;
}
const sessions = new Map();
export class QrLoginCancelledError extends Error {
}
/** 取消用户正在进行的扫码。
 * @param userId 用户 ID
 * @returns 是否存在会话
 */
export function cancelLogin(userId) {
    const previous = sessions.get(String(userId));
    previous?.controller.abort(new QrLoginCancelledError('扫码已取消或重新发起'));
    sessions.delete(String(userId));
    return !!previous;
}
/** 创建扫码会话，复用已保存的设备信息并生成登录二维码。
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
        if (account?.login_device) {
            const device = JSON.parse(account.login_device);
            session.state.device_id = device.device_id ?? session.state.device_id;
            session.state.device_name = device.device_name ?? session.state.device_name;
            session.state.device_model = device.device_model ?? session.state.device_model;
        }
        session.state.cookies.set('_MHYUUID', session.state.device_id);
        session.state.cookies.set('MIHOYO_LOGIN_PLATFORM_LIFECYCLE_ID', session.state.lifecycleId);
        signal.throwIfAborted();
        const qr = await postPassport(session.state, 'createQRLogin', {});
        assertApiSuccess(qr, '创建网页扫码二维码');
        if (!qr.data?.ticket || !qr.data.url)
            throw new Error('创建二维码响应缺少 ticket 或 url');
        session.qr = qr.data;
        session.image = await QRCode.toBuffer(session.qr.url, {
            width: QR_IMAGE_SIZE,
            margin: 2,
            errorCorrectionLevel: 'H',
        });
        signal.throwIfAborted();
        return session;
    }
    catch (error) {
        controller.signal.throwIfAborted();
        controller.abort();
        throw error;
    }
}
/** 等待网页扫码确认并原子保存凭据与三游戏绑定。
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
            const roles = [];
            for (const biz of ['hk4e_cn', 'hkrpg_cn', 'nap_cn'])
                roles.push(...(await getGenshinRoles(state, login.cookie, biz)));
            await saveLogin(session.userId, {
                ...login,
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
