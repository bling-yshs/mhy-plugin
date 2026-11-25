import type { LoginDevice } from '../types/api.js';
type STokenLogin = {
    accountId: string;
    stoken: string;
    mid?: string | null;
    ltoken?: string;
};
/** 用 SToken 兑换登录 CK。有 MID 时换 V2 的 LToken 和 Cookie Token；
 * 缺 MID 的旧账号只能用 V1 接口换 Cookie Token，LToken 沿用原 CK 中的值。
 * @param login 账号 ID、SToken、MID，旧账号另需原 LToken
 * @param device 请求使用的设备信息，缺省时临时生成
 * @param signal 取消信号
 * @returns 可直接保存的 CK
 */
export declare function exchangeCookieBySToken(login: STokenLogin, device?: LoginDevice, signal?: AbortSignal): Promise<string>;
/** 用发送者已绑定账号的 SToken 兑换 LToken 和 Cookie Token，并刷新兼容缓存。
 * @param userId 发送者的主用户 ID
 * @returns 各账号的刷新结果
 */
export declare function refreshUserCookies(userId: string): Promise<string[]>;
/** 用当前原神角色所属账号的 SToken 生成抽卡记录导入链接。
 * @param userId 发送者的主用户 ID
 * @returns 角色 UID 和供 genshin 导入的链接
 */
export declare function getGachaImportUrl(userId: string): Promise<{
    uid: string;
    url: string;
}>;
export {};
