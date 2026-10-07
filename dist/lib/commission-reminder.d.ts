export type ReminderTarget = {
    botId: string;
    groupId: string;
    userId: string;
};
/** 开启时替换发送者的接收位置，关闭时停用本人唯一订阅，保留当天检查记录。
 * @param target 机器人、群及发送者身份
 * @param enabled 是否开启提醒
 * @returns 设置保存完成
 */
export declare function setCommissionReminder(target: ReminderTarget, enabled: boolean): Promise<void>;
/** 每天北京时间 23:00 检查当前 UID，按机器人和群汇总未领奖用户并一次发送。
 * @returns 当轮检查及发送完成，查询或群消息发送失败时记录日志并继续
 */
export declare function runCommissionReminders(): Promise<void>;
