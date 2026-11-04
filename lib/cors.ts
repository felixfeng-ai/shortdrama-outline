type CorsEnvironment = {
  NODE_ENV?: string
  CHENGJU_ALLOWED_ORIGINS?: string
}

const LOOPBACK_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function configuredOrigins(env: CorsEnvironment): Set<string> {
  return new Set(
    (env.CHENGJU_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  )
}

export function isAllowedOrigin(
  origin: string | null | undefined,
  env: CorsEnvironment = process.env,
): boolean {
  if (!origin || origin === 'null') return false
  const normalized = origin.trim().replace(/\/+$/, '')
  if (configuredOrigins(env).has(normalized)) return true
  return env.NODE_ENV !== 'production' && LOOPBACK_ORIGIN.test(normalized)
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}
