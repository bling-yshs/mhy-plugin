import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const HTTP_HISTORY_DIR = new URL('../.mys-http-history/', import.meta.url)

export type SetCookieObject = {
  name: string
  value: string
  [key: string]: string | number | boolean
}

export type HttpJsonResult<T> = {
  body: T
  status: number
  statusText: string
  setCookie: SetCookieObject[]
  rawSetCookie: string[]
}

type HttpJsonOptions = {
  key: string
  method?: string
  headers?: HeadersInit
  body?: unknown
}

function requestHeadersToObject(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([name, value]) => [name, value]))
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, String(value)]))
}

function getSetCookieHeaders(headers: Headers) {
  const nodeHeaders = headers as Headers & {
    getSetCookie?: () => string[]
  }

  const cookies = nodeHeaders.getSetCookie?.()
  if (cookies && cookies.length > 0) return cookies

  const fallback = headers.get('set-cookie')
  return fallback ? [fallback] : []
}

function setCookieAttributeName(name: string) {
  switch (name.toLowerCase()) {
    case 'domain':
      return 'domain'
    case 'path':
      return 'path'
    case 'expires':
      return 'expires'
    case 'max-age':
      return 'maxAge'
    case 'httponly':
      return 'httpOnly'
    case 'secure':
      return 'secure'
    case 'samesite':
      return 'sameSite'
    default:
      return name
        .toLowerCase()
        .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
  }
}

function parseSetCookie(line: string): SetCookieObject | undefined {
  const parts = line.split(';')
  const first = parts.shift()?.trim()
  if (!first) return undefined

  const separator = first.indexOf('=')
  if (separator <= 0) return undefined

  const cookie: SetCookieObject = {
    name: first.slice(0, separator).trim(),
    value: first.slice(separator + 1),
  }

  for (const part of parts) {
    const attribute = part.trim()
    if (!attribute) continue

    const attributeSeparator = attribute.indexOf('=')
    if (attributeSeparator === -1) {
      cookie[setCookieAttributeName(attribute)] = true
      continue
    }

    const rawName = attribute.slice(0, attributeSeparator).trim()
    const rawValue = attribute.slice(attributeSeparator + 1).trim()
    const name = setCookieAttributeName(rawName)
    if (name === 'maxAge' && /^-?\d+$/.test(rawValue)) {
      cookie[name] = Number(rawValue)
    } else {
      cookie[name] = rawValue
    }
  }

  return cookie
}

function parseResponseBody(text: string): unknown {
  if (text === '') return ''
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function nowAtUtc8() {
  const utc8 = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${utc8.toISOString().slice(0, -1)}+08:00`
}

async function writeHistory(key: string, at: string, record: unknown) {
  const dayDir = new URL(`${at.slice(0, 10)}/`, HTTP_HISTORY_DIR)
  await mkdir(dayDir, { recursive: true })
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
  const timestamp = at.replace(/[:.]/g, '-')
  const file = new URL(`${timestamp}_${safeKey}_${randomUUID()}.json`, dayDir)
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
}

export async function httpJson<T>(url: string, options: HttpJsonOptions): Promise<HttpJsonResult<T>> {
  const at = nowAtUtc8()
  const startedAt = performance.now()
  const method = options.method ?? 'GET'
  const headers = requestHeadersToObject(options.headers)
  const requestBody = options.body
  const wireBody =
    requestBody === undefined
      ? undefined
      : typeof requestBody === 'string'
        ? requestBody
        : JSON.stringify(requestBody)

  const req = {
    method,
    url,
    headers,
    ...(requestBody === undefined ? {} : { body: requestBody }),
  }

  try {
    const response = await fetch(url, {
      method,
      headers: options.headers,
      body: wireBody,
    })
    const text = await response.text()
    const body = parseResponseBody(text)
    const rawSetCookie = getSetCookieHeaders(response.headers)
    const setCookie = rawSetCookie
      .map(parseSetCookie)
      .filter((cookie): cookie is SetCookieObject => cookie !== undefined)
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100

    await writeHistory(options.key, at, {
      at,
      durationMs,
      req,
      resp: {
        status: response.status,
        statusText: response.statusText,
        body,
        setCookie,
      },
    })

    return {
      body: body as T,
      status: response.status,
      statusText: response.statusText,
      setCookie,
      rawSetCookie,
    }
  } catch (error: unknown) {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100
    const normalizedError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: 'UnknownError', message: String(error) }

    await writeHistory(options.key, at, {
      at,
      durationMs,
      req,
      error: normalizedError,
    })
    throw error
  }
}
