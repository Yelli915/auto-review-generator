import assert from 'node:assert/strict'
import test from 'node:test'
import { createMockRequest, withEnv } from '../testUtils.js'
import { authorizeRequest } from './auth.js'

test('authorizeRequest normalizes configured production origins', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: 'test-token',
      ALLOWED_ORIGINS: 'https://example.vercel.app/',
    },
    async () => {
      const req = createMockRequest(
        { action: 'keywords' },
        {
          origin: 'https://example.vercel.app',
          'x-api-auth-token': 'test-token',
        },
      )

      const result = await authorizeRequest(req)

      assert.equal(result.ok, true)
    },
  )
})

test('authorizeRequest rejects unlisted production origins', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      GOOGLE_CLIENT_ID: null,
      API_AUTH_TOKEN: 'test-token',
      ALLOWED_ORIGINS: 'https://example.vercel.app',
    },
    async () => {
      const req = createMockRequest(
        { action: 'keywords' },
        {
          origin: 'https://preview.example.vercel.app',
          'x-api-auth-token': 'test-token',
        },
      )

      const result = await authorizeRequest(req)

      assert.equal(result.ok, false)
      assert.equal(result.status, 403)
      assert.equal(result.error, 'Origin is not allowed.')
    },
  )
})
