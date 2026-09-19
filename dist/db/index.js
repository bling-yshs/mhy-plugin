var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { Sequelize, DataTypes, Model, } from 'sequelize';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
// 测试可显式指定数据库，正常启动沿用云崽配置。
const configUrl = new URL('../../../../lib/config/config.js', import.meta.url);
const options = process.env.MHY_DATABASE_PATH
    ? { dialect: 'sqlite', storage: process.env.MHY_DATABASE_PATH, logging: false }
    : (await import(__rewriteRelativeImportExtension(configUrl.href))).default.db;
if (options.dialect === 'sqlite' && options.storage !== ':memory:')
    await mkdir(path.dirname(options.storage), { recursive: true });
export const sequelize = new Sequelize(options);
const games = ['gs', 'sr', 'zzz'];
/** 读取兼容表内的 JSON。
 * @param raw 数据库值
 * @param fallback 无效值的默认结果
 * @returns 解析结果
 */
function parse(raw, fallback) {
    try {
        return JSON.parse(String(raw)) ?? fallback;
    }
    catch {
        return fallback;
    }
}
export class BaseModel extends Model {
    static Types = DataTypes;
    static COLUMNS;
    /** 初始化保持旧表名的模型。
     * @param model 模型类
     * @param columns 列定义
     * @returns 无返回值
     */
    static initDB(model, columns) {
        model.init(columns, { sequelize, tableName: model.name.replace(/DB$/, 's') });
        model.COLUMNS = columns;
    }
}
export class MysUserDB extends BaseModel {
    /** 查找账号或创建未持久化对象。
     * @param ltuid 米游社账号
     * @param create 是否创建对象
     * @returns 模型或 false
     */
    static async find(ltuid = '', create = false) {
        return (await this.findByPk(ltuid)) || (create ? this.build({ ltuid }) : false);
    }
    /** 保存旧模型的兼容字段，保留独立凭据。
     * @param mys 原神账号对象
     * @returns 保存结果
     */
    async saveDB(mys) {
        if (!mys.ck || !mys.device || !mys.db)
            return false;
        this.set({ ck: mys.ck, type: mys.type, device: mys.device, uids: mys.uids });
        await this.save({ fields: ['ltuid', 'ck', 'type', 'device', 'uids'] });
    }
}
export class UserDB extends BaseModel {
    /** 查找旧用户模型。
     * @param id 用户 ID
     * @param type 用户平台
     * @returns 持久化或新建模型
     */
    static async find(id, type = 'qq') {
        id = type === 'qq' ? String(id) : type + id;
        return (await this.findByPk(id)) || this.build({ id, type });
    }
    /** 保存旧用户对象的关联和游戏选择。
     * @param user 原神用户对象
     * @returns 保存完成
     */
    async saveDB(user) {
        const ltuids = Object.values(user.mysUsers)
            .filter((m) => !!m && !!m.ck && !!m.ltuid)
            .map((m) => m.ltuid);
        const data = {};
        for (const [game, ds] of Object.entries(user._games)) {
            data[game] = {
                uid: ds.uid,
                data: Object.fromEntries(Object.entries(ds.data).map(([uid, item]) => [uid, { uid: item.uid, type: item.type }])),
            };
        }
        this.set({ ltuids: ltuids.join(','), games: data });
        await this.save({ fields: ['id', 'type', 'ltuids', 'games'] });
    }
}
export class UserGameDB extends BaseModel {
}
BaseModel.initDB(MysUserDB, {
    ltuid: { type: DataTypes.INTEGER, primaryKey: true },
    type: { type: DataTypes.STRING, defaultValue: 'mys' },
    ck: DataTypes.STRING,
    device: DataTypes.STRING,
    stoken: DataTypes.TEXT,
    mid: DataTypes.STRING,
    login_device: DataTypes.TEXT,
    bound_device: DataTypes.TEXT,
    uids: {
        type: DataTypes.STRING,
        /** 获取账号游戏 UID。
         * @returns UID 映射
         */
        get() {
            return parse(this.getDataValue('uids'), {});
        },
        /** 保存账号游戏 UID。
         * @param value UID 映射
         * @returns 无返回值
         */
        set(value) {
            this.setDataValue('uids', JSON.stringify(value));
        },
    },
});
BaseModel.initDB(UserDB, {
    id: { type: DataTypes.STRING, primaryKey: true, autoIncrement: false },
    type: { type: DataTypes.STRING, defaultValue: 'qq' },
    name: DataTypes.STRING,
    face: DataTypes.STRING,
    ltuids: DataTypes.STRING,
    data: DataTypes.STRING,
    games: {
        type: DataTypes.STRING,
        /** 获取旧游戏选择格式。
         * @returns 三游戏数据
         */
        get() {
            const data = parse(this.getDataValue('games'), {});
            return Object.fromEntries(games.map((game) => [game, { uid: data[game]?.uid || '', data: data[game]?.data || {} }]));
        },
        /** 保存游戏选择。
         * @param value 游戏数据
         * @returns 无返回值
         */
        set(value) {
            this.setDataValue('games', JSON.stringify(value));
        },
    },
});
BaseModel.initDB(UserGameDB, {
    userId: DataTypes.STRING,
    game: DataTypes.STRING,
    uid: DataTypes.STRING,
    data: {
        type: DataTypes.STRING,
        /** 读取旧游戏条目映射。
         * @returns UID 映射
         */
        get() {
            return Object.fromEntries(Object.values(parse(this.getDataValue('data'), []))
                .filter((item) => item?.uid)
                .map((item) => [item.uid, item]));
        },
        /** 保存旧游戏条目列表。
         * @param value 条目映射
         * @returns 无返回值
         */
        set(value) {
            this.setDataValue('data', JSON.stringify(Object.values(value)));
        },
    },
});
// 按当前模型创建缺失的表；既有表的升级由独立迁移工具执行。
await MysUserDB.sync();
await UserDB.sync();
await UserGameDB.sync();
let writeQueue = Promise.resolve();
/** 串行化本插件 SQLite 写事务。
 * @param work 事务内操作
 * @returns 事务结果
 */
export function writeTransaction(work) {
    const result = writeQueue.then(() => sequelize.transaction(work));
    writeQueue = result.then(() => { }, () => { });
    return result;
}
