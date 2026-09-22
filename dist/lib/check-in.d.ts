import type { Game } from '../types/api.js';
/** 返回北京时间的日期和时分。
 * @returns 日期及 HH:mm 时间
 */
export declare function signClock(): {
    date: string;
    time: string;
};
/** 设置发送者关联账号的对应游戏签到开关。
 * @param userId 发送者 ID
 * @param game 游戏
 * @param enabled 是否开启
 * @returns 更新的米游社账号 ID
 */
export declare function setAutoSign(userId: string, game: Game, enabled: boolean): Promise<string[]>;
/** 为一个角色执行签到，手动成功时提示缺少绑定设备；自动任务遇到当天任意记录即跳过。
 * @param ltuid 米游社账号 ID
 * @param game 游戏
 * @param uid 游戏角色 UID
 * @param manual 是否用户手动触发
 * @returns 面向用户的签到结果
 */
export declare function signRole(ltuid: string, game: Game, uid: string, manual: boolean): Promise<string>;
/** 为发送者全部绑定账号的指定游戏角色手动签到。
 * @param userId 发送者 ID
 * @param game 游戏
 * @returns 每个角色的签到结果
 */
export declare function signUser(userId: string, game: Game): Promise<string[]>;
/** 执行已开启账号的每日自动签到，逐角色隔离错误且不重试。
 * @returns 执行完成
 */
export declare function runAutoSign(): Promise<void>;
/** 查询发送者关联账号的三游戏自动签到开关。
 * @param userId 发送者 ID
 * @returns 状态文本
 */
export declare function getSignStatus(userId: string): Promise<string>;
