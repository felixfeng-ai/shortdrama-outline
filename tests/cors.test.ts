import assert from 'node:assert/strict'
import test from 'node:test'

import { corsHeaders, isAllowedOrigin, isLoopbackHost } from '../lib/cors.ts'

test('development loopback origins can call the shared Web/App API', () => {
  const env = { NODE_ENV: 'development' }
  assert.equal(isAllowedOrigin('http://127.0.0.1:8103', env), true)
  assert.equal(isAllowedOrigin('http://localhost:8103', env), true)
  assert.equal(isAllowedOrigin('https://example.com', env), false)
})

test('production uses the explicit origin allowlist', () => {
  const env = {
    NODE_ENV: 'production',
    CHENGJU_ALLOWED_ORIGINS: 'https://veyatv.com,https://chenju.work,http://127.0.0.1:8103',
  }
  assert.equal(isAllowedOrigin('https://veyatv.com', env), true)
  assert.equal(isAllowedOrigin('https://chenju.work', env), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:8103', env), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:9999', env), false)
})

test('CORS supports Bearer and app device headers', () => {
  const headers = corsHeaders('http://127.0.0.1:8103')
  assert.equal(headers['Access-Control-Allow-Credentials'], 'true')
  assert.match(headers['Access-Control-Allow-Headers'], /Authorization/)
  assert.match(headers['Access-Control-Allow-Headers'], /X-Chengju-Device/)
  assert.match(headers['Access-Control-Allow-Headers'], /Range/)
  assert.match(headers['Access-Control-Expose-Headers'], /Content-Range/)
  assert.equal(isLoopbackHost('veyatv.com'), false)
})
