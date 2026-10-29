import { createJsonHeaders, readJsonSafely } from '../shared/httpJson.js'
import {
  DAILY_USAGE_LIMITS,
  getTrimmedEnv,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  USAGE_STORE_KEY_PREFIX,
} from './config.js'

const RATE_LIMIT_STORE = new Map()
const DAILY_USAGE_STORE = new Map()
// 저장소가 커져도 요청마다 전체를 훑지 않도록 정리는 창(또는 하루)마다 한 번만 합니다.
const MEMORY_STORE_SWEEP_SIZE = 2000
let lastRateSweepAt = 0
let lastDailySweepDay = ''

function normalizeIdentifier(identifier) {
  return typeof identifier === 'string' && identifier ? identifier : 'unknown'
}

function readStoreCount(result) {
  const count = Number(result?.result)
  if (!Number.isFinite(count)) {
    throw new Error('공유 사용량 저장소 응답을 읽을 수 없습니다.')
  }
  return count
}

function getSharedUsageStoreConfig() {
  const url = getTrimmedEnv('UPSTASH_REDIS_REST_URL').replace(/\/+$/, '')
  const token = getTrimmedEnv('UPSTASH_REDIS_REST_TOKEN')
  return url && token ? { url, token } : null
}

async function callSharedUsageStore(config, commands) {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: createJsonHeaders({ Authorization: `Bearer ${config.token}` }),
    body: JSON.stringify(commands),
  })
  const data = await readJsonSafely(response)
  if (!response.ok || !Array.isArray(data)) {
    throw new Error('공유 사용량 저장소에 접근할 수 없습니다.')
  }
  return data
}

async function incrementSharedUsageLimit({ config, key, limit, ttlSec }) {
  const results = await callSharedUsageStore(config, [
    ['INCR', key],
    ['EXPIRE', key, ttlSec, 'NX'],
  ])
  const count = readStoreCount(results[0])
  if (count > limit) {
    return { ok: false, retryAfterSec: ttlSec, limit }
  }
  // 날짜가 들어간 같은 키를 되돌리므로 자정을 넘긴 뒤 환불해도 새 날 횟수에는 영향이 없습니다.
  // 그 사이 키가 만료됐으면 DECR이 -1 키를 새로 만드므로 EXPIRE NX로 다시 만료되게 합니다.
  const refund = async () => {
    const [result] = await callSharedUsageStore(config, [
      ['DECR', key],
      ['EXPIRE', key, ttlSec, 'NX'],
    ])
    return Math.max(0, readStoreCount(result))
  }
  return { ok: true, count, limit, refund }
}

function applyMemoryRateLimit(key) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const prev = RATE_LIMIT_STORE.get(key)
  const hits = (prev?.hits ?? []).filter((t) => t > windowStart)
  if (hits.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(1000, RATE_LIMIT_WINDOW_MS - (now - hits[0]))
    return { ok: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
  }
  hits.push(now)
  RATE_LIMIT_STORE.set(key, { hits, updatedAt: now })

  if (RATE_LIMIT_STORE.size > MEMORY_STORE_SWEEP_SIZE && now - lastRateSweepAt > RATE_LIMIT_WINDOW_MS) {
    lastRateSweepAt = now
    for (const [ip, value] of RATE_LIMIT_STORE.entries()) {
      if (!value || value.updatedAt < windowStart) RATE_LIMIT_STORE.delete(ip)
    }
  }
  return { ok: true }
}

export async function applyRateLimit(rawIdentifier) {
  const identifier = normalizeIdentifier(rawIdentifier)
  const config = getSharedUsageStoreConfig()
  if (!config) return applyMemoryRateLimit(identifier)

  // 인메모리와 같은 sliding window를 Redis에서는 직전 창 개수에 남은 비율을 곱해 근사합니다.
  // 고정 창만 쓰면 창 경계에서 한도의 2배까지 몰아 보낼 수 있습니다.
  const now = Date.now()
  const windowId = Math.floor(now / RATE_LIMIT_WINDOW_MS)
  const elapsed = (now % RATE_LIMIT_WINDOW_MS) / RATE_LIMIT_WINDOW_MS
  const windowSec = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
  const keyFor = (id) =>
    [USAGE_STORE_KEY_PREFIX, 'rate', encodeURIComponent(identifier), id].join(':')
  const results = await callSharedUsageStore(config, [
    ['INCR', keyFor(windowId)],
    ['EXPIRE', keyFor(windowId), windowSec * 2, 'NX'],
    ['GET', keyFor(windowId - 1)],
  ])
  const current = readStoreCount(results[0])
  const previous = Number(results[2]?.result) || 0
  if (previous * (1 - elapsed) + current > RATE_LIMIT_MAX_REQUESTS) {
    // 인메모리처럼 거절된 요청은 세지 않습니다. 세면 다음 창의 직전 창 가중치로 넘어가 차단이 길어집니다.
    await callSharedUsageStore(config, [['DECR', keyFor(windowId)]])
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - elapsed) * windowSec)) }
  }
  return { ok: true }
}

// 사용자가 한국에 있으므로 일일 한도는 서버 시간대(Vercel은 UTC)가 아닌 KST 자정에 초기화합니다.
// 한국은 서머타임이 없어 고정 +9시간으로 충분합니다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export function getLocalDayKey(date = new Date()) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function secondsUntilNextLocalDay(date = new Date()) {
  const msIntoDay = (date.getTime() + KST_OFFSET_MS) % DAY_MS
  return Math.max(1, Math.ceil((DAY_MS - msIntoDay) / 1000))
}

function applyMemoryDailyUsageLimit(identifier, action, limit, now, resetAfterSec) {
  const today = getLocalDayKey(now)
  const key = `${action}:${identifier}`
  const prev = DAILY_USAGE_STORE.get(key)
  const count = prev?.dayKey === today ? Number(prev.count) || 0 : 0

  if (count >= limit) {
    return {
      ok: false,
      retryAfterSec: resetAfterSec,
      limit,
    }
  }

  DAILY_USAGE_STORE.set(key, {
    dayKey: today,
    count: count + 1,
    updatedAt: now.getTime(),
  })

  if (DAILY_USAGE_STORE.size > MEMORY_STORE_SWEEP_SIZE && lastDailySweepDay !== today) {
    lastDailySweepDay = today
    for (const [storeKey, value] of DAILY_USAGE_STORE.entries()) {
      if (!value || value.dayKey !== today) DAILY_USAGE_STORE.delete(storeKey)
    }
  }

  // 같은 날 항목만 되돌리므로 자정을 넘긴 뒤 환불해도 새 날 횟수에는 영향이 없습니다.
  const refund = async () => {
    const current = DAILY_USAGE_STORE.get(key)
    if (current?.dayKey !== today) return null
    current.count = Math.max(0, current.count - 1)
    return current.count
  }
  return { ok: true, count: count + 1, limit, refund }
}

export async function applyDailyUsageLimit(rawIdentifier, action) {
  const identifier = normalizeIdentifier(rawIdentifier)
  const limit = Object.hasOwn(DAILY_USAGE_LIMITS, action)
    ? DAILY_USAGE_LIMITS[action]
    : 0
  if (!limit) return { ok: true }

  const now = new Date()
  // 한도가 초기화될 때까지 남은 초. 화면이 남은 횟수를 언제까지 믿을지 정하는 데 씁니다.
  const resetAfterSec = secondsUntilNextLocalDay(now)
  const config = getSharedUsageStoreConfig()
  if (!config) {
    return { ...applyMemoryDailyUsageLimit(identifier, action, limit, now, resetAfterSec), resetAfterSec }
  }

  const key = [
    USAGE_STORE_KEY_PREFIX,
    'daily',
    getLocalDayKey(now),
    encodeURIComponent(action),
    encodeURIComponent(identifier),
  ].join(':')
  const result = await incrementSharedUsageLimit({ config, key, limit, ttlSec: resetAfterSec })
  return { ...result, resetAfterSec }
}
