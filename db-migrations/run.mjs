import { Sequelize } from 'sequelize'
import { migrateDatabase } from '../dist/db/migrations.js'
import options from './config.mjs'

const db = new Sequelize(options)
try {
  await migrateDatabase(db, options.storage, process.argv[2])
} finally {
  await db.close()
}
