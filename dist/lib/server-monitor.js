import fetch from './fetch.js';
/** 查询充值服务的原神维护状态并判断是否开服。
 * @returns maintenance_ongoing 严格为 false 时返回 true；响应异常时抛出错误
 */
export async function isGenshinServerOpen() {
    const response = await fetch('https://topup-api-sdk.mihoyo.com/hk4e_cn/mdk/tally/tally/getTallyProfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            game: 'hk4e_cn',
            released_flag: true,
            condi: { cashier_mode: 'payment-cn', currency_by_ip: false },
        }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
        throw new Error(`开服监控请求失败：HTTP ${response.status}`);
    const result = (await response.json());
    if (result?.retcode !== 0)
        throw new Error('开服监控接口返回异常状态');
    const ongoing = result.data?.maintenance_info?.maintenance_ongoing;
    if (typeof ongoing !== 'boolean')
        throw new Error('开服监控响应维护状态缺失或类型异常');
    return ongoing === false;
}
