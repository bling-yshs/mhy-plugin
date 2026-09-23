/** 查询充值服务的原神维护状态并判断是否开服。
 * @returns maintenance_ongoing 严格为 false 时返回 true；响应异常时抛出错误
 */
export declare function isGenshinServerOpen(): Promise<boolean>;
