/** 生成公共 DS1 签名，默认使用游戏签到的盐。
 * @param salt 对应端点的盐
 * @returns DS 请求头
 */
export declare function createSignDs(salt?: string): string;
/** 对最终查询串和请求体计算 DS2。
 * @param query 实际发送的查询串
 * @param body 实际发送的请求体
 * @param salt 对应端点的盐
 * @returns DS 请求头
 */
export declare function createDs(query: string, body: string, salt?: string): string;
