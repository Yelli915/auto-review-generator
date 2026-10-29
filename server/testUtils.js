/* global process */
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'

export const png1x1Base64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

export function createMockRequest(body, headers = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  req.method = 'POST'
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.1' }
  return req
}

export function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value
    },
    end(chunk = '') {
      this.body += chunk
    },
    write(chunk = '') {
      this.body += chunk
    },
  }
}

export function withEnv(updates, fn) {
  const previous = {}
  for (const key of Object.keys(updates)) {
    previous[key] = process.env[key]
    const value = updates[key]
    if (value == null) delete process.env[key]
    else process.env[key] = value
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key]
        else process.env[key] = value
      }
    })
}

export async function withFetch(mockFetch, fn) {
  const oldFetch = globalThis.fetch
  globalThis.fetch = mockFetch
  try {
    return await fn()
  } finally {
    globalThis.fetch = oldFetch
  }
}

export async function withFetchCalls(mockFetch, fn) {
  const calls = []
  return withFetch(
    async (...args) => {
      calls.push(String(args[0]))
      return mockFetch(...args)
    },
    () => fn(calls),
  )
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export function geminiKeywordResponse(keywords) {
  return jsonResponse({
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify({ keywords }) }],
        },
      },
    ],
  })
}
