import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { httpJson } from '../http.js'

const QR_APP_ID = 'bll8iq97cem8'
const CREATE_QR_URL =
  'https://passport-api.miyoushe.com/account/ma-cn-passport/web/createQRLogin'
const STATE_FILE = new URL('../../.mys-state.json', import.meta.url)
const QR_DIR = new URL('../../data/qrcode/', import.meta.url)

type ApiResponse<T> = {
  retcode: number
  message: string
  data: T
}

type QrCreateData = {
  url: string
  ticket: string
}

type PersistedState = {
  version?: number
  device_id: string
  cookies?: Record<string, string>
  cookie_updates?: unknown[]
  last_qr?: QrCreateData & {
    image_path?: string
    created_at?: string
  }
  updated_at?: string
  [key: string]: unknown
}

async function saveState(state: PersistedState) {
  state.updated_at = new Date().toISOString()
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function loadOrCreateState(): Promise<PersistedState> {
  try {
    const raw = await readFile(STATE_FILE, 'utf8')
    const saved = JSON.parse(raw) as Partial<PersistedState>

    if (typeof saved.device_id === 'string' && saved.device_id.length > 0) {
      return saved as PersistedState
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const state: PersistedState = {
    version: 1,
    device_id: randomUUID(),
    cookies: {},
    cookie_updates: [],
  }
  await saveState(state)
  return state
}

function assertApiSuccess<T>(payload: ApiResponse<T>, apiName: string) {
  if (payload.retcode !== 0) {
    throw new Error(`${apiName}失败: retcode=${payload.retcode}, message=${payload.message}`)
  }
}

async function createQrLogin(state: PersistedState) {
  const result = await httpJson<ApiResponse<QrCreateData>>(CREATE_QR_URL, {
    key: 'create_qr_login',
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'x-rpc-app_id': QR_APP_ID,
      'x-rpc-device_id': state.device_id,
    },
  })

  assertApiSuccess(result.body, '创建米游社二维码')

  if (!result.body.data?.url || !result.body.data?.ticket) {
    throw new Error('创建二维码成功响应中缺少 url 或 ticket')
  }

  return result.body.data
}

export async function createMihoyoQrCode() {
  const state = await loadOrCreateState()
  const qr = await createQrLogin(state)

  await mkdir(QR_DIR, { recursive: true })
  const imageUrl = new URL(`mihoyo-login-${Date.now()}.png`, QR_DIR)
  const imagePath = fileURLToPath(imageUrl)

  await QRCode.toFile(imagePath, qr.url, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  })

  state.last_qr = {
    ...qr,
    image_path: imagePath,
    created_at: new Date().toISOString(),
  }
  await saveState(state)

  return {
    ...qr,
    imagePath,
  }
}
