module.exports = {
  /** 已有提醒表升级旧列，新安装的最新结构直接登记为已完成。
   * @param {import('sequelize').QueryInterface} queryInterface 数据库结构操作接口
   * @returns {Promise<void>} 迁移完成
   */
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('CommissionReminderSettings')
    await queryInterface.sequelize.transaction(async (transaction) => {
      if (columns.last_check_date) {
        await queryInterface.sequelize.query(
          'ALTER TABLE "CommissionReminderSettings" RENAME COLUMN "last_check_date" TO "last_success_at"',
          { transaction },
        )
      }
      if (columns.enabled) {
        await queryInterface.sequelize.query(
          'DELETE FROM "CommissionReminderSettings" WHERE "enabled" = 0',
          { transaction },
        )
        await queryInterface.sequelize.query(
          'ALTER TABLE "CommissionReminderSettings" DROP COLUMN "enabled"',
          { transaction },
        )
      }
    })
  },

  /** 恢复旧列名和开关列，将现存订阅设置为开启。
   * @param {import('sequelize').QueryInterface} queryInterface 数据库结构操作接口
   * @returns {Promise<void>} 结构恢复完成
   */
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        'ALTER TABLE "CommissionReminderSettings" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT 0',
        { transaction },
      )
      await queryInterface.sequelize.query(
        'UPDATE "CommissionReminderSettings" SET "enabled" = 1',
        { transaction },
      )
      await queryInterface.sequelize.query(
        'ALTER TABLE "CommissionReminderSettings" RENAME COLUMN "last_success_at" TO "last_check_date"',
        { transaction },
      )
    })
  },
}
