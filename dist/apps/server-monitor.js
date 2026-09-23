import { isGenshinServerOpen } from '../lib/server-monitor.js';
const monitors = new Map();
export class MhyServerMonitor extends plugin {
    /** 注册群开服监控命令和每 30 秒检查任务。
     * @returns 插件实例
     */
    constructor() {
        super({
            name: '[mhy-plugin]开服监控',
            dsc: '原神新版本开服群通知',
            event: 'message',
            priority: 100,
            rule: [{ reg: '^#(开启|关闭)原神开服监控$', fnc: 'toggle' }],
        });
        this.task = {
            name: '[mhy-plugin]开服监控',
            cron: '*/30 * * * * *',
            fnc: this.poll.bind(this),
            log: false,
        };
    }
    /** 开关当前机器人所在群的监控，重复开启保持原任务。
     * @returns 是否已处理
     */
    async toggle() {
        if (!this.e.isGroup || !this.e.group) {
            await this.reply('请在需要接收通知的群内发送指令');
            return true;
        }
        const key = `${this.e.self_id}:${this.e.group_id}`;
        if (this.e.msg.includes('关闭')) {
            const removed = monitors.delete(key);
            await this.reply(removed ? '开服监控已关闭' : '本群尚未开启开服监控');
        }
        else if (monitors.has(key)) {
            await this.reply('本群已开启开服监控，每 30 秒检查一次');
        }
        else {
            monitors.set(key, {
                busy: false,
                send: this.e.group.sendMsg.bind(this.e.group),
            });
            await this.reply('开服监控已开启，每 30 秒检查一次');
        }
        return true;
    }
    /** 检查各群状态，隔离失败并在发送成功后结束该群监控。
     * @returns 本轮检查完成
     */
    async poll() {
        await Promise.all([...monitors].map(async ([key, monitor]) => {
            if (monitor.busy)
                return;
            monitor.busy = true;
            try {
                const opened = await isGenshinServerOpen();
                if (!opened || monitors.get(key) !== monitor)
                    return;
                const sent = await monitor.send('原神新版本已开服');
                if (!sent)
                    throw new Error('群消息发送失败');
                if (monitors.get(key) === monitor)
                    monitors.delete(key);
            }
            catch (error) {
                logger.warn(`[mhy-plugin] 开服监控 ${key} 本轮失败，将在下轮重试：${error instanceof Error ? error.message : '未知错误'}`);
            }
            finally {
                monitor.busy = false;
            }
        }));
    }
}
