import { access } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DataTypes, Sequelize } from 'sequelize'

/** 显式备份并升级历史 SQLite 数据库，重复执行保留已有数据。
 * @param {string} database 已存在的 SQLite 文件路径
 * @returns {Promise<{columns: string[], backup: string|null}>} 新增列和备份位置
 */
export async function upgradeDatabase(database) {
  const storage = path.resolve(database)
  await access(storage)
  const db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  try {
    const qi = db.getQueryInterface()
    const tables = await qi.showAllTables()
    if (!tables.includes('MysUsers'))
      throw new Error('历史数据库缺少 MysUsers 表，请确认数据库路径')
    const columns = await qi.describeTable('MysUsers')
    const missing = ['stoken', 'mid', 'login_device', 'bound_device'].filter((key) => !columns[key])
    let backup = null
    if (missing.length) {
      backup = `${storage}.before-mhy-${Date.now()}.sqlite`
      await db.query(`VACUUM INTO ${db.escape(backup)}`)
      for (const key of missing)
        await qi.addColumn('MysUsers', key, { type: DataTypes.TEXT, allowNull: true })
    }
    return { columns: missing, backup }
  } finally {
    await db.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--database')
  if (index < 0 || !process.argv[index + 1])
    throw new Error('用法：node migration/upgrade-database.mjs --database <SQLite路径>')
  console.log(JSON.stringify(await upgradeDatabase(process.argv[index + 1]), null, 2))
}
