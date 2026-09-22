export declare class MhyCheckIn extends plugin {
    /** 注册签到命令及北京时间每日任务。
     * @returns 插件实例
     */
    constructor();
    /** 在北京时间 00:02 执行当天任务，无启动补跑。
     * @returns 执行完成
     */
    daily(): Promise<void>;
    /** 切换发送者关联账号的游戏自动签到设置。
     * @returns 是否已处理
     */
    toggle(): Promise<boolean>;
    /** 为消息发送者手动签到，允许重试当天失败记录。
     * @returns 是否已处理
     */
    sign(): Promise<boolean>;
    /** 展示本人账号的自动签到开关及今日结果。
     * @returns 是否已处理
     */
    status(): Promise<boolean>;
}
