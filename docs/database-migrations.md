# 数据库结构迁移

使用 Sequelize CLI 管理迁移，配置和迁移文件位于 `db-migrations/`。插件启动时自动完成待执行迁移，已执行的文件名由 CLI 保存在当前数据库的 `SequelizeMeta` 表。

迁移配置读取云崽根目录的 `config/default_config/db.yaml` 和 `config/config/db.yaml`，按云崽同样的方式合并配置。SQLite 的 `storage` 相对云崽根目录解析，当前默认路径是 `data/db/data.db`。执行命令时会打印数据库绝对路径。

## 本次结构修改

仅修改 `CommissionReminderSettings`：

- 删除 `enabled = 0` 的历史关闭记录。
- 将 `last_check_date` 重命名为 `last_success_at`，保留列中的值。
- 删除 `enabled` 列。表内每一行代表开启的订阅，关闭指令直接删除该行。

原有开启的订阅、机器人、群、用户 ID 和成功时间保留。其余五张业务表保持原结构。

## 安装与更新

停止机器人，在 `plugins/mhy-plugin` 目录执行：

```sh
pnpm install
pnpm build
```

启动机器人即可。数据库初始化先创建缺失的表，再执行待完成的迁移，成功后提供数据库给插件业务。已有库按旧列升级，新安装按最新模型建立表并登记迁移。

有待执行的迁移时，初始化先通过 `VACUUM INTO` 备份当前 SQLite，再运行官方 CLI。备份与数据库放在同一目录，文件名为原数据库路径加 `.before-mhy-时间.sqlite`。备份失败时初始化停止；结构修改在事务内执行，失败时回滚。CLI 成功后记录迁移文件名，后续启动会跳过已完成的迁移。

需要手动迁移时，在机器人停止后执行：

```sh
pnpm db:migrate
```

查看迁移状态：

```sh
pnpm db:migrate:status
```

## 撤销本次结构修改

停止机器人后，在插件目录执行：

```sh
pnpm db:migrate:undo
```

该命令先备份，再执行迁移的 `down`。本次 `down` 会恢复 `enabled` 和 `last_check_date`，现存订阅设为开启。撤销结构后需要使用与旧结构对应的插件代码再启动；当前版本启动会自动再次执行被撤销的迁移。迁移时删除的历史关闭记录可从迁移前备份恢复。

## 后续结构修改

在 `db-migrations/versions/` 新增带时间序号的 `.cjs` 迁移文件，编写 `up` 和 `down`，同步更新模型定义。迁移需要同时适配已有旧表和新安装时由模型建立的最新结构，随后由启动流程自动执行。
