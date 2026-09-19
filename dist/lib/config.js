import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
const DEFAULT_CONFIG_FILE = new URL('../../default-config/main.yaml', import.meta.url);
const CONFIG_DIRECTORY = new URL('../../config/', import.meta.url);
const CONFIG_FILE = new URL('./main.yaml', CONFIG_DIRECTORY);
/**
 * 确保用户配置文件存在。
 * @returns {void}
 */
function ensureConfigFile() {
    if (existsSync(CONFIG_FILE))
        return;
    mkdirSync(CONFIG_DIRECTORY, { recursive: true });
    copyFileSync(DEFAULT_CONFIG_FILE, CONFIG_FILE);
}
/**
 * 读取单个 YAML 配置文件。
 * @param {URL} file 配置文件路径
 * @returns {PartialMhyPluginConfig} 配置内容
 */
function readConfigFile(file) {
    const parsed = YAML.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return {};
    return parsed;
}
ensureConfigFile();
const mergedConfig = {
    debug: false,
    ...readConfigFile(DEFAULT_CONFIG_FILE),
    ...readConfigFile(CONFIG_FILE),
};
const config = {
    debug: typeof mergedConfig.debug === 'boolean' ? mergedConfig.debug : false,
};
export default config;
