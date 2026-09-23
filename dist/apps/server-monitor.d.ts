export declare class MhyServerMonitor extends plugin {
    /** 注册群开服监控命令和每 30 秒检查任务。
     * @returns 插件实例
     */
    constructor();
    /** 开关当前机器人所在群的监控，重复开启保持原任务。
     * @returns 是否已处理
     */
    toggle(): Promise<boolean>;
    /** 检查各群状态，隔离失败并在发送成功后结束该群监控。
     * @returns 本轮检查完成
     */
    poll(): Promise<void>;
}
