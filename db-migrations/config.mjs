import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const botRoot = fileURLToPath(new URL('../../../', import.meta.url))
const options = {
  ...YAML.parse(readFileSync(path.join(botRoot, 'config/default_config/db.yaml'), 'utf8')),
  ...YAML.parse(readFileSync(path.join(botRoot, 'config/config/db.yaml'), 'utf8')),
}

export default {
  ...options,
  storage: path.resolve(botRoot, process.env.MHY_DATABASE_PATH || options.storage),
}
