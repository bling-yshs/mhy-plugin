type YunzaiRule = {
  reg: string
  fnc: string
  event?: string
  log?: boolean
  permission?: 'master' | 'owner' | 'admin' | 'all'
}

type YunzaiPluginOptions = {
  name?: string
  dsc?: string
  event?: string
  priority?: number
  rule?: YunzaiRule[]
}

declare class plugin {
  constructor(options: YunzaiPluginOptions)
  reply(
    message?: string,
    quote?: boolean,
    data?: Record<string, string | number | boolean>,
  ): Promise<void> | void
}

declare const logger: {
  info(message: string): void
  error(message: string): void
  debug?(message: string): void
}
