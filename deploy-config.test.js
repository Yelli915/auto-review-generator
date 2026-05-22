import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function getVercelHeaderMap() {
  const config = readJson('vercel.json')
  const headers = config.headers?.[0]?.headers ?? []
  return Object.fromEntries(headers.map(({ key, value }) => [key, value]))
}

function getNetlifyHeaderMap() {
  const toml = readFileSync('netlify.toml', 'utf8')
  const valuesStart = toml.indexOf('[headers.values]')
  assert.notEqual(valuesStart, -1)

  const valuesBlock = toml.slice(valuesStart)
  const headers = {}
  const re = /^\s*([A-Za-z0-9-]+)\s*=\s*"((?:\\"|[^"])*)"\s*$/gm
  let match

  while ((match = re.exec(valuesBlock)) !== null) {
    headers[match[1]] = match[2].replace(/\\"/g, '"')
  }

  return headers
}

function getNginxHeaderMap() {
  const config = readFileSync('deploy/nginx/security-headers.conf', 'utf8')
  const headers = {}
  const re = /^\s*add_header\s+([A-Za-z0-9-]+)\s+"((?:\\"|[^"])*)"\s+always;\s*$/gm
  let match

  while ((match = re.exec(config)) !== null) {
    headers[match[1]] = match[2].replace(/\\"/g, '"')
  }

  return headers
}

test('security headers stay in sync across deploy configs', () => {
  const expected = getVercelHeaderMap()

  assert.deepEqual(getNetlifyHeaderMap(), expected)
  assert.deepEqual(getNginxHeaderMap(), expected)
})

test('Vercel and Netlify publish the same Vite build output', () => {
  const vercel = readJson('vercel.json')
  const netlify = readFileSync('netlify.toml', 'utf8')

  assert.equal(vercel.buildCommand, 'npm run build')
  assert.equal(vercel.outputDirectory, 'dist')
  assert.match(netlify, /^\s*command\s*=\s*"npm run build"\s*$/m)
  assert.match(netlify, /^\s*publish\s*=\s*"dist"\s*$/m)
})
