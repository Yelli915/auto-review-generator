/* global Buffer */
import { MAX_REQUEST_BODY_BYTES } from '../config.js'

export function setCommonSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
}

export function json(res, code, body) {
  res.statusCode = code
  setCommonSecurityHeaders(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export async function readJsonBody(req) {
  const chunks = []
  let totalBytes = 0
  for await (const chunk of req) {
    const size = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(String(chunk))
    totalBytes += size
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      return { tooLarge: true }
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
