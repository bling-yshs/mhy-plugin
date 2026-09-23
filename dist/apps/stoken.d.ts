export declare class MhyStoken extends plugin {
    /** 注册 CK 刷新和原神抽卡记录更新命令。
     * @returns 命令实例
     */
    constructor();
    /** 刷新发送者全部绑定账号的 CK，并逐个报告结果。
     * @returns 是否处理命令
     */
    refreshCookie(): Promise<boolean>;
    /** 生成当前原神角色的 authkey，并交给 genshin 更新抽卡记录。
     * @returns 是否处理命令
     */
    updateGacha(): Promise<boolean>;
}
