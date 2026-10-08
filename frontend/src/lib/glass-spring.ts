export type SpringState = Readonly<{ value: number; velocity: number }>
export type SpringConfig = Readonly<{
  stiffness?: number
  damping?: number
  mass?: number
  reducedMotion?: boolean
}>

export const MAX_SPRING_DELTA = 0.064

/** Advance a damped spring analytically; dt is seconds, not milliseconds. */
export function stepSpring(state: SpringState, target: number, dt: number, config: SpringConfig = {}): SpringState {
  const { stiffness = 280, damping = 26, mass = 1, reducedMotion = false } = config
  if (![state.value, state.velocity, target, dt, stiffness, damping, mass].every(Number.isFinite)
    || stiffness <= 0 || damping < 0 || mass <= 0) {
    throw new RangeError('Spring values must be finite, with positive stiffness/mass and nonnegative damping.')
  }
  if (reducedMotion) return { value: target, velocity: 0 }
  const elapsed = Math.min(MAX_SPRING_DELTA, Math.max(0, dt))
  if (!elapsed) return { ...state }
  const offset = state.value - target
  const alpha = damping / (2 * mass)
  const omegaSquared = stiffness / mass
  const discriminant = alpha * alpha - omegaSquared
  let nextOffset: number
  let velocity: number

  if (Math.abs(discriminant) <= omegaSquared * 1e-10) {
    const decay = Math.exp(-alpha * elapsed)
    const coefficient = state.velocity + alpha * offset
    nextOffset = decay * (offset + coefficient * elapsed)
    velocity = decay * (state.velocity - alpha * coefficient * elapsed)
  } else if (discriminant < 0) {
    const omega = Math.sqrt(-discriminant)
    const decay = Math.exp(-alpha * elapsed)
    const sin = Math.sin(omega * elapsed)
    const cos = Math.cos(omega * elapsed)
    nextOffset = decay * (offset * cos + (state.velocity + alpha * offset) * sin / omega)
    velocity = decay * (state.velocity * cos - (alpha * state.velocity + omegaSquared * offset) * sin / omega)
  } else {
    const root = Math.sqrt(discriminant)
    // The quotient avoids cancellation for strongly overdamped configurations.
    const slow = -omegaSquared / (alpha + root)
    const fast = -alpha - root
    const first = (state.velocity - fast * offset) / (slow - fast)
    const second = offset - first
    const slowDecay = Math.exp(slow * elapsed)
    const fastDecay = Math.exp(fast * elapsed)
    nextOffset = first * slowDecay + second * fastDecay
    velocity = first * slow * slowDecay + second * fast * fastDecay
  }
  if (Math.abs(nextOffset) < 0.0001 && Math.abs(velocity) < 0.0001) return { value: target, velocity: 0 }
  return { value: target + nextOffset, velocity }
}
