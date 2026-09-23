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
