/**
 * 按原生 fetch 的方式发送请求，开启 debug 时异步记录请求和响应。
 * @param input 请求地址或 Request 对象
 * @param init 原生 fetch 请求选项
 * @returns 原生 Response 对象；请求失败时抛出原始异常
 */
export default function fetch(input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]): Promise<Response>;
