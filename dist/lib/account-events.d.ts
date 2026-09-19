export type AccountChange = {
    accountId: string;
    userIds: string[];
    deleted?: boolean;
};
/** 注册兼容缓存更新器。
 * @param listener 缓存刷新函数
 * @returns 取消注册函数
 */
export declare function onAccountChange(listener: (change: AccountChange) => Promise<void>): () => void;
/** 等待已注册的兼容缓存刷新，数据库提交后的错误单独报告。
 * @param change 已提交的账号变化
 * @returns 刷新完成
 */
export declare function notifyAccountChange(change: AccountChange): Promise<void>;
