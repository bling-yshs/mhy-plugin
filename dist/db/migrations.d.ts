import { type Sequelize } from 'sequelize';
/** 执行官方数据库迁移，有待执行的结构修改时先备份当前 SQLite。
 * @param db 当前数据库连接
 * @param storage 当前 SQLite 文件路径
 * @param command 执行迁移或撤销最近一次迁移
 * @returns 迁移完成，失败时抛出错误
 */
export declare function migrateDatabase(db: Sequelize, storage: string, command: 'db:migrate' | 'db:migrate:undo'): Promise<void>;
