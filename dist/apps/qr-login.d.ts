export declare class MhyQrLogin extends plugin {
    /** 注册扫码命令。
     * @returns 命令实例
     */
    constructor();
    /** 取消当前用户扫码。
     * @returns 是否处理
     */
    cancel(): Promise<boolean>;
    /** 发送二维码并保存扫码结果。
     * @returns 是否处理
     */
    qrLogin(): Promise<boolean>;
}
