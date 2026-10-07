/** 精确匹配用户当前启用原神 UID 的本人账号。
 * @param userId 账号模型中的用户 ID
 * @returns 当前 UID 及归属账号
 */
export declare function getReminderRole(userId: string): Promise<{
    uid: string;
    accountId: string;
}>;
/** 每天北京时间 23:00 检查当前 UID，按机器人和群汇总未领奖用户并一次发送。
 * @returns 当轮检查及发送完成，查询或群消息发送失败时记录日志并继续
 */
export declare function runCommissionReminders(): Promise<void>;
