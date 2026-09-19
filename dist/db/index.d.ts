import { Sequelize, DataTypes, Model, type ModelAttributes, type Transaction } from 'sequelize';
export declare const sequelize: Sequelize;
type Uids = Partial<Record<'gs' | 'sr' | 'zzz', string[]>>;
type GameItem = {
    uid: string;
    type: string;
};
type Games = Record<string, {
    uid: string;
    data: Record<string, GameItem>;
}>;
type LegacyAccount = {
    ck: string;
    device: string;
    type: string;
    ltuid: string | number;
    uids: Uids;
    db?: object;
};
export declare class BaseModel extends Model {
    static Types: typeof DataTypes;
    static COLUMNS: ModelAttributes;
    /** 初始化保持旧表名的模型。
     * @param model 模型类
     * @param columns 列定义
     * @returns 无返回值
     */
    static initDB(model: typeof BaseModel, columns: ModelAttributes): void;
}
export declare class MysUserDB extends BaseModel {
    ltuid: number;
    ck: string;
    type: string;
    device: string;
    stoken: string | null;
    mid: string | null;
    login_device: string | null;
    bound_device: string | null;
    uids: Uids;
    /** 查找账号或创建未持久化对象。
     * @param ltuid 米游社账号
     * @param create 是否创建对象
     * @returns 模型或 false
     */
    static find(ltuid?: string, create?: boolean): Promise<MysUserDB | false>;
    /** 保存旧模型的兼容字段，保留独立凭据。
     * @param mys 原神账号对象
     * @returns 保存结果
     */
    saveDB(mys: LegacyAccount): Promise<void | false>;
}
export declare class UserDB extends BaseModel {
    id: string;
    ltuids: string;
    games: Games;
    /** 查找旧用户模型。
     * @param id 用户 ID
     * @param type 用户平台
     * @returns 持久化或新建模型
     */
    static find(id: string, type?: string): Promise<UserDB>;
    /** 保存旧用户对象的关联和游戏选择。
     * @param user 原神用户对象
     * @returns 保存完成
     */
    saveDB(user: {
        mysUsers: Record<string, LegacyAccount | false>;
        _games: Games;
    }): Promise<void>;
}
export declare class UserGameDB extends BaseModel {
}
/** 串行化本插件 SQLite 写事务。
 * @param work 事务内操作
 * @returns 事务结果
 */
export declare function writeTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
export {};
