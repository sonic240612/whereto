import { isIP } from 'node:net'

export interface RateLimitOptions {
  requestsPerMinute?: number
  maxClients?: number
  now?: () => number
}

/** Canonical IP keys prevent textual IPv6 aliases from acquiring new quotas. */
export function canonicalClientIp(value: string | undefined): string | undefined {
  if (!value) return undefined
  const family = isIP(value)
  if (family === 4) return value
  if (family !== 6) return undefined
  const normalized = new URL(`http://[${value.split('%')[0]}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([a-f\d]+):([a-f\d]+)$/.exec(normalized)
  if (!mapped) return normalized
  const high = parseInt(mapped[1], 16)
  const low = parseInt(mapped[2], 16)
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`
}

/** Bounded fixed-window counters. Never evict a live client to admit a new key. */
export function createClientLimiter({ requestsPerMinute = 60, maxClients = 4096, now = Date.now }: RateLimitOptions = {}) {
  if (!Number.isSafeInteger(requestsPerMinute) || requestsPerMinute < 1 || !Number.isSafeInteger(maxClients) || maxClients < 1) {
    throw new Error('Rate limits must be positive safe integers')
  }
  const clients = new Map<string, number>()
  let windowStart = now()
  return (client: string): { allowed: boolean; retryAfter: number } => {
    const timestamp = now()
    if (timestamp < windowStart || timestamp - windowStart >= 60_000) {
      clients.clear()
      windowStart = timestamp
    }
    const retryAfter = Math.max(1, Math.ceil((windowStart + 60_000 - timestamp) / 1000))
    const count = clients.get(client)
    if (count === undefined && clients.size >= maxClients) return { allowed: false, retryAfter }
    if ((count ?? 0) >= requestsPerMinute) return { allowed: false, retryAfter }
    clients.set(client, (count ?? 0) + 1)
    return { allowed: true, retryAfter }
  }
}

/** Only explicit IPs/CIDRs are accepted; booleans, hop counts and /0 are unsafe. */
export function validateTrustedProxyCidrs(values: string[]): string[] {
  for (const value of values) {
    const [address, prefix, ...extra] = value.split('/')
    const family = isIP(address)
    if (!family || extra.length || (prefix !== undefined && (!/^\d+$/.test(prefix)
      || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXY_CIDRS must contain explicit IP addresses or nonzero CIDR ranges')
    }
  }
  return values
}
