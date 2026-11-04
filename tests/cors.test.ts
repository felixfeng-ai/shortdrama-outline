import assert from 'node:assert/strict'
import test from 'node:test'

import { corsHeaders, isAllowedOrigin, isLoopbackHost } from '../lib/cors.ts'

test('development loopback origins can use credentialed API requests', () => {
  const env = { NODE_ENV: 'development' }

  assert.equal(isAllowedOrigin('http://127.0.0.1:8103', env), true)
  assert.equal(isAllowedOrigin('http://localhost:19006', env), true)
  assert.equal(isAllowedOrigin('https://example.com', env), false)
  assert.equal(isAllowedOrigin('null', env), false)
})

test('production uses only the explicit origin allowlist', () => {
  const env = {
    NODE_ENV: 'production',
    CHENGJU_ALLOWED_ORIGINS: 'https://app.chengju.work,http://127.0.0.1:8103',
  }

  assert.equal(isAllowedOrigin('https://app.chengju.work', env), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:8103', env), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:9999', env), false)
})

test('only loopback API hosts may opt into loopback preview origins', () => {
  assert.equal(isLoopbackHost('127.0.0.1'), true)
  assert.equal(isLoopbackHost('localhost'), true)
  assert.equal(isLoopbackHost('chengju.work'), false)
})

test('CORS headers echo the allowed origin and permit credentials', () => {
  const headers = corsHeaders('http://127.0.0.1:8103')

  assert.equal(headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:8103')
  assert.equal(headers['Access-Control-Allow-Credentials'], 'true')
  assert.match(headers['Access-Control-Allow-Methods'], /GET/)
  assert.match(headers['Access-Control-Allow-Methods'], /POST/)
  assert.equal(headers.Vary, 'Origin')
})
