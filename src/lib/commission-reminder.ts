import dayjs from 'dayjs'
import { Op } from 'sequelize'
import { CommissionReminderSettingDB, MysUserDB, UserDB, writeTransaction } from '../db/index.js'
import { request } from './request.js'

export type ReminderTarget = {
  botId: string
  groupId: string
  userId: string
}

/** 精确匹配用户当前启用原神 UID 的本人账号。
 * @param userId 账号模型中的用户 ID
 * @returns 当前 UID 及归属账号
 */
async function getReminderRole(userId: string): Promise<{ uid: string; accountId: string }> {
  const user = await UserDB.findByPk(userId)
  const uid = user?.games.gs?.uid
  if (!user || !uid) throw new Error('请先绑定并启用原神 UID')
  if (!user.ltuids) throw new Error('请先绑定米游社账号的 CK')
  const accounts = await MysUserDB.findAll({
    where: { ltuid: { [Op.in]: user.ltuids.split(',') } },
  })
  const account = accounts.find(account => account.ck && account.uids.gs?.includes(uid))
  if (!account) throw new Error('当前启用原神 UID 尚未绑定本人的米游社账号，请先绑定 CK')
  return { uid, accountId: String(account.ltuid) }
}

/** 开启时替换发送者的接收位置，关闭时停用本人唯一订阅，保留当天检查记录。
 * @param target 机器人、群及发送者身份
 * @param enabled 是否开启提醒
 * @returns 设置保存完成
 */
export async function setCommissionReminder(target: ReminderTarget, enabled: boolean): Promise<void> {
  if (enabled) await getReminderRole(target.userId)
  await writeTransaction(async transaction => {
    const setting = await CommissionReminderSettingDB.findByPk(target.userId, { transaction })
    if (setting) {
      await setting.update(
        enabled ? { bot_id: target.botId, group_id: target.groupId, enabled } : { enabled },
        { transaction },
      )
    } else if (enabled) {
      await CommissionReminderSettingDB.create(
        { user_id: target.userId, bot_id: target.botId, group_id: target.groupId, enabled },
        { transaction },
      )
    }
  })
}

/** 每天北京时间 23:00 检查当前 UID，按机器人和群汇总未领奖用户并一次发送。
 * @returns 当轮检查及发送完成，查询或群消息发送失败时记录日志并继续
 */
export async function runCommissionReminders(): Promise<void> {
  const date = dayjs().format('YYYY-MM-DD')
  const settings = await CommissionReminderSettingDB.findAll({ where: { enabled: true } })
  const groups = new Map<
    string,
    { botId: string; groupId: string; users: { userId: string; uid: string }[] }
  >()
  for (const setting of settings) {
    try {
      const [updated] = await CommissionReminderSettingDB.update(
        { last_check_date: date },
        {
          where: {
            user_id: setting.user_id,
            enabled: true,
            last_check_date: { [Op.ne]: date },
          },
        },
      )
      if (!updated) continue
      const role = await getReminderRole(setting.user_id)
      const response = await request('dailyNote', { game: 'gs', ...role }, {})
      if (response.retcode !== 0) throw new Error(`委托查询失败：${response.retcode}`)
      const received = response.data?.is_extra_task_reward_received
      if (typeof received !== 'boolean') throw new Error('委托奖励领取状态缺失或类型异常')
      if (received) continue

      const key = `${setting.bot_id}:${setting.group_id}`
      let group = groups.get(key)
      if (!group) {
        group = { botId: setting.bot_id, groupId: setting.group_id, users: [] }
        groups.set(key, group)
      }
      group.users.push({ userId: setting.user_id, uid: role.uid })
    } catch (error) {
      logger.warn(
        `[mhy-plugin] 委托提醒 ${setting.bot_id}:${setting.group_id}:${setting.user_id} 失败`,
        error,
      )
    }
  }
  for (const group of groups.values()) {
    try {
      const current = await CommissionReminderSettingDB.findAll({
        where: {
          bot_id: group.botId,
          group_id: group.groupId,
          enabled: true,
          user_id: { [Op.in]: group.users.map(user => user.userId) },
        },
      })
      const enabledUsers = new Set(current.map(setting => setting.user_id))
      const users = group.users.filter(user => enabledUsers.has(user.userId))
      if (!users.length) continue
      const message = [
        '原神今日委托奖励尚未领取，记得上线领取：\n',
        ...users.flatMap(user => [segment.at(user.userId), ` UID ${user.uid}\n`]),
      ]
      const sent = await Bot.sendGroupMsg(group.botId, group.groupId, message)
      if (!sent) throw new Error('委托提醒群消息发送失败')
    } catch (error) {
      logger.warn(`[mhy-plugin] 委托提醒群 ${group.botId}:${group.groupId} 发送失败`, error)
    }
  }
}
