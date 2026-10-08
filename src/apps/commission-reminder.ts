import { CommissionReminderSettingDB, UserDB } from '../db/index.js'
import { getReminderRole, runCommissionReminders } from '../lib/commission-reminder.js'

export class MhyCommissionReminder extends plugin {
  /** 注册群内委托提醒开关及北京时间每日检查任务。
   * @returns 插件实例
   */
  constructor() {
    super({
      name: '[mhy-plugin]委托提醒',
      dsc: '每天23点提醒领取原神每日委托奖励',
      event: 'message',
      priority: 100,
      rule: [{ reg: '^#(开启|关闭)原神委托提醒$', fnc: 'toggle' }],
    })
    this.task = {
      name: '[mhy-plugin]每日委托领奖提醒',
      cron: '0 0 23 * * *',
      fnc: runCommissionReminders,
      log: false,
    }
  }

  /** 在群内开启并保存唯一订阅，关闭时删除订阅，回复当前 UID 和状态。
   * @returns 是否已处理
   */
  async toggle(): Promise<boolean> {
    if (!this.e.isGroup) {
      await this.reply('请在需要接收提醒的群内发送指令')
      return true
    }
    try {
      const userId = String(this.e.user_id)
      const enabled = this.e.msg.includes('开启')
      if (enabled) {
        const { uid } = await getReminderRole(userId)
        await CommissionReminderSettingDB.upsert(
          {
            user_id: userId,
            bot_id: String(this.e.self_id),
            group_id: String(this.e.group_id),
          },
          { fields: ['user_id', 'bot_id', 'group_id'] },
        )
        await this.reply(`UID ${uid}，委托提醒已开启，检查时间每天 23:00`)
      } else {
        await CommissionReminderSettingDB.destroy({ where: { user_id: userId } })
        const user = await UserDB.findByPk(userId)
        const uid = user?.games.gs?.uid
        if (uid) {
          await this.reply(`UID ${uid}，委托提醒已关闭`)
        } else {
          await this.reply('委托提醒已关闭')
        }
      }
    } catch (error) {
      await this.reply(error instanceof Error ? error.message : String(error))
    }
    return true
  }
}
