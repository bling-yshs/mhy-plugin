import type { GameRole } from '../types/api.js';
export declare const QR_IMAGE_SIZE = 400;
type QrCreateData = {
    url: string;
    ticket: string;
};
type LoginState = {
    signal: AbortSignal;
    device_id: string;
    device_name: string;
    device_model: string;
};
export type LoginSession = {
    userId: string;
    state: LoginState;
    controller: AbortController;
    qr?: QrCreateData;
    image?: Buffer;
    waiting?: Promise<{
        accountId: string;
        roles: GameRole[];
    }>;
};
export declare class QrLoginCancelledError extends Error {
}
/** 取消用户正在进行的扫码。
 * @param userId 用户 ID
 * @returns 是否存在会话
 */
export declare function cancelLogin(userId: string): boolean;
/** 创建扫码会话并生成高容错的登录二维码。
 * @param userId 发起用户 ID
 * @returns 独立扫码会话
 */
export declare function startLogin(userId: string): Promise<LoginSession>;
/** 等待扫码确认，兑换凭据并原子保存三游戏绑定。
 * @param session 扫码会话
 * @param onStatus 状态变化提示
 * @returns 已保存账号及角色
 */
export declare function waitForLogin(session: LoginSession, onStatus?: (status: string) => Promise<void>): Promise<{
    accountId: string;
    roles: GameRole[];
}>;
export {};
