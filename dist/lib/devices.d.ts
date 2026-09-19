import type { Device } from '../types/api.js';
/** 保留 ZZZ 获取指纹后的设备登记流程。
 * @param cookie 请求账号凭据
 * @param device 当前有效设备
 * @returns 登记完成，失败保留原有查询能力
 */
export declare function registerDeviceSession(cookie: string, device: Device): Promise<void>;
/** 读取账号的统一绑定设备。
 * @param accountId 米游社账号
 * @returns 设备或 undefined
 */
export declare function getBoundDevice(accountId: string): Promise<Device | undefined>;
/** 校验用户归属并绑定设备。
 * @param userId 发起用户
 * @param accountId 目标账号
 * @param info 手动或安卓设备信息
 * @returns 已绑定设备
 */
export declare function bindDevice(userId: string, accountId: string, info: unknown): Promise<Device>;
/** 解除本人账号设备绑定。
 * @param userId 发起用户
 * @param accountId 目标账号
 * @returns 解除完成
 */
export declare function unbindDevice(userId: string, accountId: string): Promise<void>;
/** 合并同账号刷新并防止覆盖并发绑定。
 * @param accountId 请求所用账号
 * @returns 当前有效绑定设备
 */
export declare function ensureDevice(accountId: string): Promise<Device | undefined>;
/**
 * 校验并提取手动指纹或安卓设备信息。
 * @param {object} info 用户提交的设备JSON
 * @returns {object|false} 规范化的设备记录，格式错误时返回false
 */
export declare function parseDevice(info: any): Device | false;
/**
 * 根据安卓设备信息请求米游社设备指纹，保留稳定设备ID。
 * @param {object} device 包含device_id和android信息的设备记录
 * @param {boolean} overseas 是否使用国际服指纹接口
 * @returns {Promise<object>} 包含指纹及七天有效期的新设备记录
 */
export declare function refreshDevice(device: Device, overseas?: boolean): Promise<Device>;
