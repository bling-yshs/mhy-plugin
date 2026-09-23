export declare class MhyApiProbe extends plugin {
    /** 注册仅主人可用的接口测试命令。
     * @returns 命令实例
     */
    constructor();
    /** 解析命令 JSON，使用绑定账号发起请求并记录响应。
     * @returns 是否已处理
     */
    probe(): Promise<boolean>;
}
