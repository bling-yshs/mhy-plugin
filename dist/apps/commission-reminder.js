import { runCommissionReminders, setCommissionReminder } from '../lib/commission-reminder.js';
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
        });
        this.task = {
            name: '[mhy-plugin]每日委托领奖提醒',
            cron: '0 0 23 * * *',
            fnc: runCommissionReminders,
            log: false,
        };
    }
    /** 在当前群开启发送者的唯一提醒，或在任意群关闭本人的提醒。
     * @returns 是否已处理
     */
    async toggle() {
        if (!this.e.isGroup) {
            await this.reply('请在需要接收提醒的群内发送指令');
            return true;
        }
        try {
            const userId = String(this.e.user_id);
            const enabled = this.e.msg.includes('开启');
            await setCommissionReminder({
                botId: String(this.e.self_id),
                groupId: String(this.e.group_id),
                userId,
            }, enabled);
            await this.reply(enabled
                ? '原神委托提醒已开启：每天北京时间 23:00 检查当前启用的 UID，委托奖励未领取时会在本群 @ 你。'
                : '你的原神委托提醒已关闭');
        }
        catch (error) {
            await this.reply(error instanceof Error ? error.message : String(error));
        }
        return true;
    }
}
