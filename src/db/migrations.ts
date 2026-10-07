import { execFileSync } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dayjs from 'dayjs'
import { QueryTypes, type Sequelize } from 'sequelize'

/** 执行官方数据库迁移，有待执行的结构修改时先备份当前 SQLite。
 * @param db 当前数据库连接
 * @param storage 当前 SQLite 文件路径
 * @param command 执行迁移或撤销最近一次迁移
 * @returns 迁移完成，失败时抛出错误
 */
export async function migrateDatabase(
  db: Sequelize,
  storage: string,
  command: 'db:migrate' | 'db:migrate:undo',
): Promise<void> {
  if (db.getDialect() !== 'sqlite') throw new Error('当前迁移仅用于 SQLite 数据库')
  const pluginRoot = fileURLToPath(new URL('../../', import.meta.url))
  const files = (await readdir(path.join(pluginRoot, 'db-migrations/versions'))).filter((file) =>
    file.endsWith('.cjs'),
  )
  const tables = await db.getQueryInterface().showAllTables()
  let executed: string[] = []
  if (tables.includes('SequelizeMeta')) {
    const rows = await db.query<{ name: string }>('SELECT "name" FROM "SequelizeMeta"', {
      type: QueryTypes.SELECT,
    })
    executed = rows.map((row) => row.name)
  }
  if (command === 'db:migrate' && files.every((file) => executed.includes(file))) return

  const database = path.resolve(storage)
  await access(database)
  const backup = `${database}.before-mhy-${dayjs().format('YYYYMMDD-HHmmss-SSS')}.sqlite`
  await db.query(`VACUUM INTO ${db.escape(backup)}`)
  console.log(`[mhy-plugin] 数据库：${database}`)
  console.log(`[mhy-plugin] 迁移前备份：${backup}`)

  const require = createRequire(import.meta.url)
  execFileSync(process.execPath, [require.resolve('sequelize-cli/lib/sequelize'), command], {
    cwd: pluginRoot,
    stdio: 'inherit',
    env: { ...process.env, MHY_DATABASE_PATH: database },
  })
}
