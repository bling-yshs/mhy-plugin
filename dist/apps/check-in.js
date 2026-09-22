import { getSignStatus, runAutoSign, setAutoSign, signClock, signUser } from '../lib/check-in.js';
export class MhyCheckIn extends plugin {
    /** 注册签到命令及北京时间每日任务。
     * @returns 插件实例
     */
    constructor() {
        super({
            name: '[mhy-plugin]签到',
            dsc: '三游戏手动与自动签到',
            event: 'message',
            priority: -387420490,
            rule: [
                { reg: '^#(原神|星铁|绝区零)?签到$', fnc: 'sign' },
                { reg: '^#(开启|关闭)(原神|星铁|绝区零)自动签到$', fnc: 'toggle' },
                { reg: '^#自动签到状态$', fnc: 'status' },
            ],
        });
        this.task = {
            name: '[mhy-plugin]每日签到',
            cron: '0 * * * * *',
            fnc: this.daily.bind(this),
            log: false,
        };
    }
    /** 在北京时间 00:02 执行当天任务，无启动补跑。
     * @returns 执行完成
     */
    async daily() {
        if (signClock().time === '00:02')
            await runAutoSign();
    }
    /** 切换发送者关联账号的游戏自动签到设置。
     * @returns 是否已处理
     */
    async toggle() {
        const game = /星铁/.test(this.e.msg) ? 'sr' : /绝区零/.test(this.e.msg) ? 'zzz' : 'gs';
        const enabled = this.e.msg.includes('开启');
        try {
            const ids = await setAutoSign(String(this.e.mainUserId || this.e.originalUserId || this.e.user_id), game, enabled);
            await this.reply(`自动签到已${enabled ? '开启' : '关闭'}，米游社账号：${ids.join('、')}。\n每天北京时间 00:02 执行，失败后需手动签到。`);
        }
        catch (error) {
            await this.reply(error instanceof Error ? error.message : '设置失败');
        }
        return true;
    }
    /** 为消息发送者手动签到，允许重试当天失败记录。
     * @returns 是否已处理
     */
    async sign() {
        const game = /星铁/.test(this.e.msg) ? 'sr' : /绝区零/.test(this.e.msg) ? 'zzz' : 'gs';
        try {
            await this.reply((await signUser(String(this.e.mainUserId || this.e.originalUserId || this.e.user_id), game)).join('\n'));
        }
        catch (error) {
            logger.error('[mhy-plugin] 手动签到执行失败', error);
            await this.reply('签到执行失败，请查看机器人日志');
        }
        return true;
    }
    /** 展示本人账号的自动签到开关及今日结果。
     * @returns 是否已处理
     */
    async status() {
        await this.reply(await getSignStatus(String(this.e.mainUserId || this.e.originalUserId || this.e.user_id)));
        return true;
    }
}
