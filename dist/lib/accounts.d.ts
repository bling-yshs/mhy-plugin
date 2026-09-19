import { MysUserDB } from '../db/index.js';
import type { Game, GameRole, LoginDevice } from '../types/api.js';
/** 从 Cookie 提取账号 ID。
 * @param cookie Cookie 字符串
 * @returns 账号 ID 或空串
 */
export declare function accountIdFromCookie(cookie?: string): string;
/** 读取用户绑定账号。
 * @param userId 用户 ID
 * @returns 按绑定顺序排列的账号
 */
export declare function getAccounts(userId: string): Promise<MysUserDB[]>;
/** 获取用户当前游戏的本人账号。
 * @param userId 用户 ID
 * @param game 游戏
 * @returns 账号或 undefined
 */
export declare function resolveAccount(userId: string, game: Game): Promise<MysUserDB | undefined>;
/** 检查用户是否关联指定账号。
 * @param userId 用户 ID
 * @param accountId 账号 ID
 * @returns 是否关联
 */
export declare function ownsAccount(userId: string, accountId: string): Promise<boolean>;
/** 查询共享账号的全部用户。
 * @param accountId 账号 ID
 * @returns 用户 ID 列表
 */
export declare function accountUsers(accountId: string): Promise<string[]>;
/** 原子保存完整登录结果并刷新兼容缓存。
 * @param userId 发起者 ID
 * @param login 已确认且角色查询完成的登录结果
 * @param signal 会话取消信号
 * @returns 保存的账号
 */
export declare function saveLogin(userId: string, login: {
    accountId: string;
    mid: string;
    stoken: string;
    cookie: string;
    device: LoginDevice;
    roles: GameRole[];
}, signal?: AbortSignal): Promise<MysUserDB>;
/** 解除用户关联；最后一个关联移除后清理账号。
 * @param userId 用户 ID
 * @param accountId 账号 ID
 * @returns 是否删除账号
 */
export declare function unlinkAccount(userId: string, accountId: string): Promise<boolean>;
