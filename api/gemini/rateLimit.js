/* global process */
import { createJsonHeaders, readJsonSafely } from '../../shared/httpJson.js'
import {
  DAILY_USAGE_ACTIONS,
  DAILY_USAGE_MAX_REQUESTS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  USAGE_STORE_KEY_PREFIX,
} from './config.js'

const RATE_LIMIT_STORE = new Map()
const DAILY_USAGE_STORE = new Map()

function encodeUsageKeyPart(value) {
  return encodeURIComponent(String(value || 'unknown'))
}

function getSharedUsageStoreConfig() {
  const url =
    typeof process.env.UPSTASH_REDIS_REST_URL === 'string'
      ? process.env.UPSTASH_REDIS_REST_URL.trim().replace(/\/+$/, '')
      : ''
  const token =
    typeof process.env.UPSTASH_REDIS_REST_TOKEN === 'string'
      ? process.env.UPSTASH_REDIS_REST_TOKEN.trim()
      : ''
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

async function incrementSharedUsageLimit({
  config,
  key,
  limit,
  ttlSec,
  retryAfterSec = ttlSec,
}) {
  const results = await callSharedUsageStore(config, [
    ['INCR', key],
    ['EXPIRE', key, ttlSec, 'NX'],
  ])
  const count = Number(results[0]?.result)
  if (!Number.isFinite(count)) {
    throw new Error('공유 사용량 저장소 응답을 읽을 수 없습니다.')
  }
  if (count > limit) {
    return { ok: false, retryAfterSec, limit }
  }
  return { ok: true, count, limit }
}

function applyMemoryRateLimit(identifier) {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const key = typeof identifier === 'string' && identifier ? identifier : 'unknown'
  const prev = RATE_LIMIT_STORE.get(key)
  const hits = (prev?.hits ?? []).filter((t) => t > windowStart)
  if (hits.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(1000, RATE_LIMIT_WINDOW_MS - (now - hits[0]))
    return { ok: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
  }
  hits.push(now)
  RATE_LIMIT_STORE.set(key, { hits, updatedAt: now })

  if (RATE_LIMIT_STORE.size > 2000) {
    for (const [ip, value] of RATE_LIMIT_STORE.entries()) {
      if (!value || value.updatedAt < windowStart) RATE_LIMIT_STORE.delete(ip)
    }
  }
  return { ok: true }
}

export async function applyRateLimit(identifier) {
  const config = getSharedUsageStoreConfig()
  if (!config) return applyMemoryRateLimit(identifier)

  const windowId = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)
  const key = [
    USAGE_STORE_KEY_PREFIX,
    'rate',
    encodeUsageKeyPart(identifier),
    windowId,
  ].join(':')
  return incrementSharedUsageLimit({
    config,
    key,
    limit: RATE_LIMIT_MAX_REQUESTS,
    ttlSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  })
}

function getLocalDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function secondsUntilNextLocalDay(date = new Date()) {
  const nextDay = new Date(date)
  nextDay.setHours(24, 0, 0, 0)
  return Math.max(1, Math.ceil((nextDay.getTime() - date.getTime()) / 1000))
}

function applyMemoryDailyUsageLimit(identifier, action) {
  if (!DAILY_USAGE_ACTIONS.has(action)) return { ok: true }

  const now = new Date()
  const today = getLocalDayKey(now)
  const key = typeof identifier === 'string' && identifier ? identifier : 'unknown'
  const prev = DAILY_USAGE_STORE.get(key)
  const count = prev?.dayKey === today ? Number(prev.count) || 0 : 0

  if (count >= DAILY_USAGE_MAX_REQUESTS) {
    return {
      ok: false,
      retryAfterSec: secondsUntilNextLocalDay(now),
      limit: DAILY_USAGE_MAX_REQUESTS,
    }
  }

  DAILY_USAGE_STORE.set(key, {
    dayKey: today,
    count: count + 1,
    updatedAt: now.getTime(),
  })

  if (DAILY_USAGE_STORE.size > 2000) {
    for (const [storeKey, value] of DAILY_USAGE_STORE.entries()) {
      if (!value || value.dayKey !== today) DAILY_USAGE_STORE.delete(storeKey)
    }
  }

  return { ok: true }
}

export async function applyDailyUsageLimit(identifier, action) {
  if (!DAILY_USAGE_ACTIONS.has(action)) return { ok: true }

  const config = getSharedUsageStoreConfig()
  if (!config) return applyMemoryDailyUsageLimit(identifier, action)

  const now = new Date()
  const key = [
    USAGE_STORE_KEY_PREFIX,
    'daily',
    getLocalDayKey(now),
    encodeUsageKeyPart(action),
    encodeUsageKeyPart(identifier),
  ].join(':')
  return incrementSharedUsageLimit({
    config,
    key,
    limit: DAILY_USAGE_MAX_REQUESTS,
    ttlSec: secondsUntilNextLocalDay(now),
    retryAfterSec: secondsUntilNextLocalDay(now),
  })
}
