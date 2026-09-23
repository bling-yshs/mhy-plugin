import type { ApiResponse, Game, JsonValue, Operations, RequestContext } from '../types/api.js';
export type RequestProbeOptions = {
    method?: 'GET' | 'POST';
    body?: JsonValue;
    history?: boolean;
};
/** 判断旧操作是否属于当前迁移范围。
 * @param operation 原有操作名
 * @returns 是否接管
 */
export declare function handlesOperation(operation: string): boolean;
/** 根据旧 UID 规则确定区服。
 * @param uid 游戏 UID
 * @param game 游戏标识
 * @returns 区服
 */
export declare function getServer(uid: string, game: Game): string;
/** 构造类型明确的游戏查询，响应数据原样交还调用方。
 * @param operation 游戏操作名
 * @param context 账号和角色上下文
 * @param params 接口参数
 * @returns 完整米哈游响应
 */
export declare function request<K extends keyof Operations>(operation: K, context: RequestContext, params: Operations[K]['params']): Promise<ApiResponse<Operations[K]['data']>>;
/** 发送兼容端点，统一签名、凭据及设备管理。
 * @param operation 原插件接口名
 * @param context 角色与账号上下文
 * @param params 原接口参数
 * @param probe 测试请求覆盖项
 * @returns 未转换的原始响应
 */
export declare function execute(operation: string, context: RequestContext, params?: Record<string, any>, probe?: RequestProbeOptions): Promise<ApiResponse<any>>;
/** 兼容原神 getData 的缓存和 api 字段，保留完整响应。
 * @param api 旧请求实例
 * @param type 旧操作名
 * @param data 旧参数
 * @param cached 是否写查询缓存
 * @returns 原响应或 false
 */
export declare function legacyGetData(api: any, type: string, data?: Record<string, any>, cached?: boolean): Promise<ApiResponse<any> | false>;
/** 查询账号角色列表并保留原响应结构。
 * @param cookie 米游社 Cookie
 * @param serv 国服或国际服
 * @returns 完整角色响应或 false
 */
export declare function getGameRoles(cookie: string, serv?: string): Promise<ApiResponse<any> | false>;
