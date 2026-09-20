import assert from 'node:assert/strict'
import { unwatchFile } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import test from 'node:test'

/**
 * 等待监听器将对象属性更新为预期值。
 * @param {object} target 待观察对象
 * @param {string} key 属性名
 * @param {boolean | number} expected 预期值
 * @returns {Promise<void>} 更新完成后的 Promise
 */
async function waitForValue(target, key, expected) {
  const deadline = Date.now() + 5000
  while (target[key] !== expected && Date.now() < deadline) await setTimeout(50)
  assert.equal(target[key], expected)
}

/**
 * 在隔离目录验证配置热更新、错误恢复和监听器退出行为。
 * @param {import('node:test').TestContext} t 测试上下文
 * @returns {Promise<void>} 测试完成后的 Promise
 */
async function configHotReload(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mhy-config-test-'))
  const defaults = path.join(directory, 'default-config', 'main.yaml')
  const user = path.join(directory, 'config', 'main.yaml')
  const moduleFile = path.join(directory, 'dist', 'lib', 'config.js')
  const warning = t.mock.method(console, 'warn', t.mock.fn())
  try {
    await mkdir(path.dirname(defaults), { recursive: true })
    await mkdir(path.dirname(moduleFile), { recursive: true })
    await writeFile(defaults, 'debug: false\n')
    const source = await readFile(new URL('../dist/lib/config.js', import.meta.url), 'utf8')
    await writeFile(moduleFile, source.replace("'yaml'", `'${import.meta.resolve('yaml')}'`))
    const { default: config } = await import(pathToFileURL(moduleFile).href)
    const reference = config
    assert.equal(config.debug, false)
    assert.equal(await readFile(user, 'utf8'), 'debug: false\n')

    await writeFile(user, 'debug: true\n')
    await waitForValue(config, 'debug', true)
    assert.equal(config, reference)
    await writeFile(user, 'debug: false\n')
    await waitForValue(config, 'debug', false)

    await writeFile(user, '{}\n')
    await writeFile(defaults, 'debug: true\n')
    await waitForValue(config, 'debug', true)
    await writeFile(user, 'debug: false\n')
    await waitForValue(config, 'debug', false)
    await writeFile(defaults, 'debug: false\n')
    await setTimeout(1200)
    await writeFile(defaults, 'debug: true\n')
    await setTimeout(1200)
    assert.equal(config.debug, false)

    for (const invalid of ['debug: [', 'debug: "true"\n', 'debug: null\n', '', '[]\n']) {
      await writeFile(user, invalid)
      await setTimeout(1200)
      assert.equal(config.debug, false)
    }
    assert.ok(warning.mock.callCount() >= 5)

    await writeFile(user, 'debug: true\n')
    await waitForValue(config, 'debug', true)
    await rm(user)
    await setTimeout(1200)
    assert.equal(config.debug, true)
    await writeFile(user, 'debug: false\n')
    await waitForValue(config, 'debug', false)

    const replacement = path.join(directory, 'replacement.yaml')
    await writeFile(replacement, 'debug: true\n')
    await rename(replacement, user)
    await waitForValue(config, 'debug', true)

    await copyFile(defaults, replacement)
    await writeFile(defaults, 'debug: invalid\n')
    await writeFile(user, 'debug: false\n')
    await setTimeout(1200)
    assert.equal(config.debug, true)
    await rename(replacement, defaults)
    await waitForValue(config, 'debug', false)

    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(pathToFileURL(moduleFile).href)})`,
      ],
      { timeout: 5000, encoding: 'utf8' },
    )
    assert.equal(child.error, undefined)
    assert.equal(child.status, 0, child.stderr)
  } finally {
    unwatchFile(defaults)
    unwatchFile(user)
    await rm(directory, { recursive: true, force: true })
  }
}

test('配置支持原地热更新、覆盖优先级、非法内容保留旧值及文件恢复', configHotReload)
