export declare class MhyCommissionReminder extends plugin {
    /** 注册群内委托提醒开关及北京时间每日检查任务。
     * @returns 插件实例
     */
    constructor();
    /** 在群内开启并保存唯一订阅，关闭时删除订阅，回复当前 UID 和状态。
     * @returns 是否已处理
     */
    toggle(): Promise<boolean>;
}
