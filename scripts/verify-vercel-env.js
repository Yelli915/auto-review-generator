const REQUIRED_VERCEL_ENV = [
  'GEMINI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'VITE_GOOGLE_CLIENT_ID',
  'ALLOWED_ORIGINS',
]

const OPTIONAL_VERCEL_ENV = [
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

  if (
    hasValue('GOOGLE_CLIENT_ID') &&
    hasValue('VITE_GOOGLE_CLIENT_ID') &&
    process.env.GOOGLE_CLIENT_ID.trim() !== process.env.VITE_GOOGLE_CLIENT_ID.trim()
  ) {
    fail('GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID must match.')
  }

  const missingOptional = OPTIONAL_VERCEL_ENV.filter((name) => !hasValue(name))
  if (missingOptional.length > 0) {
    console.warn(
      `[vercel-env] Optional shared usage-limit variables are not set: ${missingOptional.join(', ')}`,
    )
  }
}
