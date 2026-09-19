export type AccountChange = { accountId: string; userIds: string[]; deleted?: boolean }
const listeners = new Set<(change: AccountChange) => Promise<void>>()

/** 注册兼容缓存更新器。
 * @param listener 缓存刷新函数
 * @returns 取消注册函数
 */
export function onAccountChange(listener: (change: AccountChange) => Promise<void>): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 等待已注册的兼容缓存刷新，数据库提交后的错误单独报告。
 * @param change 已提交的账号变化
 * @returns 刷新完成
 */
export async function notifyAccountChange(change: AccountChange): Promise<void> {
  for (const listener of listeners) {
    try {
      await listener(change)
    } catch {
      console.error('[mhy-plugin] 账号已保存，兼容缓存刷新失败，请重启机器人')
    }
  }
}
