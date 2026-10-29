/* global process */
const REQUIRED_VERCEL_ENV = [
  'GEMINI_API_KEY',
  'ALLOWED_ORIGINS',
  // 로그인 없이 공개된 API라, 인스턴스마다 따로 세는 인메모리 한도로는 남용을 막지 못합니다.
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

function hasValue(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim() !== ''
}

function fail(message) {
  console.error(`[vercel-env] ${message}`)
  process.exitCode = 1
}

if (process.env.VERCEL === '1') {
  const missing = REQUIRED_VERCEL_ENV.filter((name) => !hasValue(name))

  if (missing.length > 0) {
    fail(`Missing required Vercel environment variables: ${missing.join(', ')}`)
  }
}
