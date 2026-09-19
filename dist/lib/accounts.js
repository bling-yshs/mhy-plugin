import { MysUserDB, UserDB, writeTransaction } from '../db/index.js';
import { notifyAccountChange } from './account-events.js';
/** 从 Cookie 提取账号 ID。
 * @param cookie Cookie 字符串
 * @returns 账号 ID 或空串
 */
export function accountIdFromCookie(cookie = '') {
    return (/(?:^|;\s*)(?:ltuid_v2|ltuid|account_id_v2|account_id|stuid)=([^;]+)/.exec(cookie)?.[1] || '');
}
/** 读取用户绑定账号。
 * @param userId 用户 ID
 * @returns 按绑定顺序排列的账号
 */
export async function getAccounts(userId) {
    const user = await UserDB.findByPk(String(userId));
    const result = [];
    for (const id of (user?.ltuids || '').split(',').filter(Boolean)) {
        const account = await MysUserDB.findByPk(id);
        if (account)
            result.push(account);
    }
    return result;
}
/** 获取用户当前游戏的本人账号。
 * @param userId 用户 ID
 * @param game 游戏
 * @returns 账号或 undefined
 */
export async function resolveAccount(userId, game) {
    const user = await UserDB.findByPk(String(userId));
    const accounts = await getAccounts(userId);
    return (accounts.find((account) => account.uids?.[game]?.includes(String(user?.games?.[game]?.uid))) ||
        accounts.find((account) => account.uids?.[game]?.length));
}
/** 检查用户是否关联指定账号。
 * @param userId 用户 ID
 * @param accountId 账号 ID
 * @returns 是否关联
 */
export async function ownsAccount(userId, accountId) {
    const user = await UserDB.findByPk(String(userId));
    return (user?.ltuids || '').split(',').includes(String(accountId));
}
/** 查询共享账号的全部用户。
 * @param accountId 账号 ID
 * @returns 用户 ID 列表
 */
export async function accountUsers(accountId) {
    return (await UserDB.findAll())
        .filter((user) => (user.ltuids || '').split(',').includes(String(accountId)))
        .map((user) => String(user.id));
}
/** 原子保存完整登录结果并刷新兼容缓存。
 * @param userId 发起者 ID
 * @param login 已确认且角色查询完成的登录结果
 * @param signal 会话取消信号
 * @returns 保存的账号
 */
export async function saveLogin(userId, login, signal) {
    const account = await writeTransaction(async (transaction) => {
        signal?.throwIfAborted();
        const account = (await MysUserDB.findByPk(login.accountId, { transaction })) ||
            MysUserDB.build({ ltuid: login.accountId });
        const uids = { gs: [], sr: [], zzz: [] };
        for (const role of login.roles) {
            const game = { hk4e_cn: 'gs', hkrpg_cn: 'sr', nap_cn: 'zzz' }[role.game_biz];
            if (game && !uids[game].includes(String(role.game_uid)))
                uids[game].push(String(role.game_uid));
        }
        account.set({
            mid: login.mid,
            stoken: login.stoken,
            ck: login.cookie,
            type: 'mys',
            device: account.device || login.device.device_id,
            login_device: JSON.stringify(login.device),
            uids,
        });
        await account.save({ transaction });
        const user = (await UserDB.findByPk(String(userId), { transaction })) ||
            UserDB.build({ id: String(userId), type: 'qq' });
        const ids = new Set((user.ltuids || '').split(',').filter(Boolean));
        ids.add(login.accountId);
        const games = user.games;
        for (const game of ['gs', 'sr', 'zzz'])
            if (!games[game].uid && uids[game].length)
                games[game].uid = uids[game][0];
        user.set({ ltuids: [...ids].join(','), games });
        await user.save({ transaction });
        signal?.throwIfAborted();
        return account;
    });
    await notifyAccountChange({
        accountId: login.accountId,
        userIds: await accountUsers(login.accountId),
    });
    return account;
}
/** 解除用户关联；最后一个关联移除后清理账号。
 * @param userId 用户 ID
 * @param accountId 账号 ID
 * @returns 是否删除账号
 */
export async function unlinkAccount(userId, accountId) {
    const deleted = await writeTransaction(async (transaction) => {
        const user = await UserDB.findByPk(String(userId), { transaction });
        if (!user)
            return false;
        user.ltuids = (user.ltuids || '')
            .split(',')
            .filter((id) => id !== String(accountId))
            .join(',');
        await user.save({ transaction });
        const others = (await UserDB.findAll({ transaction })).some((item) => (item.ltuids || '').split(',').includes(String(accountId)));
        if (!others)
            await MysUserDB.destroy({ where: { ltuid: accountId }, transaction });
        return !others;
    });
    await notifyAccountChange({ accountId, userIds: [String(userId)], deleted });
    return deleted;
}
