export declare class MhyCommissionReminder extends plugin {
    /** 注册群内委托提醒开关及北京时间每日检查任务。
     * @returns 插件实例
     */
    constructor();
    /** 在当前群开启发送者的唯一提醒，或在任意群关闭本人的提醒。
     * @returns 是否已处理
     */
    toggle(): Promise<boolean>;
}
