import { useEffect } from 'react'
import { stepSpring, type SpringState } from '../lib/glass-spring'

type MotionAxis = 'x' | 'y' | 'scaleX' | 'scaleY' | 'pressure' | 'lightX' | 'lightY' | 'glow'
type MotionValues = Record<MotionAxis, number>
type SurfaceMotion = {
  element: HTMLElement
  states: Record<MotionAxis, SpringState>
  target: MotionValues
  pointerId: number | null
  keyboardKey: string | null
  hovered: boolean
  large: boolean
  origin: { x: number; y: number }
  rect: DOMRect
}

const rest: MotionValues = { x: 0, y: 0, scaleX: 1, scaleY: 1, pressure: 0, lightX: 0.5, lightY: 0.12, glow: 0 }
const axes = Object.keys(rest) as MotionAxis[]
const properties = ['--glass-x', '--glass-y', '--glass-scale-x', '--glass-scale-y', '--glass-pressure', '--glass-light-x', '--glass-light-y', '--glass-light-angle', '--glass-glow']
const nativeInput = 'input, textarea, select, option, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="textbox"]'
const interactive = 'button, a[href], [role="button"], [role="radio"], [role="tab"], [role="switch"]'
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const canHover = (event: PointerEvent) => event.pointerType === 'mouse' || (event.pointerType === 'pen' && event.buttons === 0)

/** The provider owns motion preferences; this effect observes native input only. */
export default function LiquidGlassMotion({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return
    const surfaces = new Map<HTMLElement, SurfaceMotion>()
    const pointers = new Map<number, SurfaceMotion>()
    let frame = 0
    let previousTime = 0

    const unavailable = (element: Element) => !element.isConnected || Boolean(element.closest('[inert], :disabled, [aria-disabled="true"], [data-glass-motion="off"]'))
    const resolve = (target: EventTarget | null) => {
      if (!(target instanceof Element) || unavailable(target) || target.closest(nativeInput)) return null
      const element = target.closest('[data-glass]')
      return element instanceof HTMLElement && element.dataset.glass !== 'lens' ? element : null
    }
    const clear = (surface: SurfaceMotion) => {
      if (surface.pointerId !== null) pointers.delete(surface.pointerId)
      for (const property of properties) surface.element.style.removeProperty(property)
      surface.element.removeAttribute('data-glass-pressure')
      surfaces.delete(surface.element)
    }
    const clearAll = () => {
      cancelAnimationFrame(frame)
      frame = 0
      previousTime = 0
      for (const surface of surfaces.values()) clear(surface)
      pointers.clear()
    }
    const write = (surface: SurfaceMotion) => {
      const { element, states } = surface
      const maxTravel = surface.large ? 2.5 : 8
      element.style.setProperty('--glass-x', `${clamp(states.x.value, -maxTravel, maxTravel).toFixed(3)}px`)
      element.style.setProperty('--glass-y', `${clamp(states.y.value, -maxTravel, maxTravel).toFixed(3)}px`)
      element.style.setProperty('--glass-scale-x', clamp(states.scaleX.value, surface.large ? 0.98 : 0.9, surface.large ? 1.015 : 1.1).toFixed(5))
      element.style.setProperty('--glass-scale-y', clamp(states.scaleY.value, surface.large ? 0.98 : 0.9, surface.large ? 1.015 : 1.1).toFixed(5))
      const pressure = clamp(states.pressure.value, 0, 1).toFixed(3)
      element.style.setProperty('--glass-pressure', pressure)
      element.style.setProperty('--glass-glow', clamp(states.glow.value, 0, 1).toFixed(3))
      element.style.setProperty('--glass-light-x', `${(clamp(states.lightX.value, 0, 1) * 100).toFixed(2)}%`)
      element.style.setProperty('--glass-light-y', `${(clamp(states.lightY.value, 0, 1) * 100).toFixed(2)}%`)
      const angle = Math.atan2(states.lightY.value - 0.5, states.lightX.value - 0.5) * 180 / Math.PI + 90
      element.style.setProperty('--glass-light-angle', `${angle.toFixed(2)}deg`)
      if (element.getAttribute('data-glass-pressure') !== pressure) element.setAttribute('data-glass-pressure', pressure)
    }
    const pressed = (surface: SurfaceMotion) => surface.pointerId !== null || surface.keyboardKey !== null
    const tick = (time: number) => {
      frame = 0
      const dt = previousTime ? (time - previousTime) / 1000 : 1 / 60
      previousTime = time
      let moving = false
      for (const surface of surfaces.values()) {
        if (unavailable(surface.element)) { clear(surface); continue }
        let settled = true
        for (const axis of axes) {
          const next = stepSpring(surface.states[axis], surface.target[axis], dt, { stiffness: 260, damping: 24 })
          surface.states[axis] = next
          if (next.value !== surface.target[axis] || next.velocity !== 0) settled = false
        }
        if (settled && !pressed(surface) && !surface.hovered) clear(surface)
        else { write(surface); moving ||= !settled }
      }
      if (moving) frame = requestAnimationFrame(tick)
      else previousTime = 0
    }
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick) }
    const getSurface = (element: HTMLElement) => {
      let surface = surfaces.get(element)
      if (!surface) {
        surface = {
          element,
          states: Object.fromEntries(axes.map(axis => [axis, { value: rest[axis], velocity: 0 }])) as Record<MotionAxis, SpringState>,
          target: { ...rest }, pointerId: null, keyboardKey: null, hovered: false,
          large: element.dataset.glass === 'panel' || element.dataset.glass === 'category',
          origin: { x: 0, y: 0 }, rect: element.getBoundingClientRect(),
        }
        surfaces.set(element, surface)
      }
      return surface
    }
    const updateMode = (surface: SurfaceMotion) => {
      const active = pressed(surface)
      const hoverScale = surface.large ? 1.006 : 1.035
      surface.target.scaleX = active ? surface.large ? 0.99 : 0.94 : surface.hovered ? hoverScale : 1
      surface.target.scaleY = active ? surface.large ? 0.99 : 0.96 : surface.hovered ? hoverScale : 1
      surface.target.pressure = active ? 1 : surface.hovered ? 0.25 : 0
      surface.target.glow = active ? 1 : surface.hovered ? 0.42 : 0
      if (!active && !surface.hovered) surface.target = { ...rest }
      else if (!active) {
        const travel = surface.large ? 0.45 : 1
        surface.target.x = (surface.target.lightX - 0.5) * 3.5 * travel
        surface.target.y = (surface.target.lightY - 0.5) * 2.5 * travel
      }
      wake()
    }
    const follow = (surface: SurfaceMotion, event: PointerEvent) => {
      const { rect } = surface
      const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1)
      const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
      const active = pressed(surface)
      const travel = surface.large ? 0.45 : 1
      surface.target.lightX = x
      surface.target.lightY = y
      surface.target.x = (x - 0.5) * (active ? 6 : 3.5) * travel
      surface.target.y = (y - 0.5) * (active ? 5 : 2.5) * travel
      updateMode(surface)
      if (surface.pointerId !== null) {
        const dx = event.clientX - surface.origin.x
        const dy = event.clientY - surface.origin.y
        const total = Math.abs(dx) + Math.abs(dy)
        const stretch = Math.min(Math.hypot(dx, dy) / 1000, 0.1) * (surface.large ? 0.15 : 1)
        const limit = surface.large ? 2.5 : 8
        surface.target.x = clamp(surface.target.x + dx * 0.08 * travel, -limit, limit)
        surface.target.y = clamp(surface.target.y + dy * 0.08 * travel, -limit, limit)
        if (total) {
          surface.target.scaleX += stretch * Math.abs(dx) / total
          surface.target.scaleY += stretch * Math.abs(dy) / total
        }
      }
    }
    const kick = (surface: SurfaceMotion) => {
      // A same-frame down/up still leaves a small compression and release impulse.
      surface.states.pressure = { value: Math.max(surface.states.pressure.value, 0.35), velocity: Math.max(surface.states.pressure.velocity, 4) }
      surface.states.glow = { value: Math.max(surface.states.glow.value, 0.35), velocity: Math.max(surface.states.glow.velocity, 4) }
      for (const axis of ['scaleX', 'scaleY'] as const) {
        surface.states[axis] = {
          value: Math.min(surface.states[axis].value, surface.large ? 0.997 : 0.985),
          velocity: Math.min(surface.states[axis].velocity, surface.large ? -0.07 : -0.42),
        }
      }
      write(surface)
    }
    const release = (surface: SurfaceMotion, cancelled = false) => {
      if (surface.pointerId !== null) pointers.delete(surface.pointerId)
      surface.pointerId = null
      if (cancelled) surface.hovered = false
      updateMode(surface)
    }
    const onOver = (event: PointerEvent) => {
      if (!canHover(event) || document.hidden) return
      const element = resolve(event.target)
      if (!element || element === resolve(event.relatedTarget)) return
      const surface = getSurface(element)
      surface.hovered = true
      if (surface.pointerId === null) surface.rect = element.getBoundingClientRect()
      follow(surface, event)
    }
    const onOut = (event: PointerEvent) => {
      const element = resolve(event.target)
      if (!element || element === resolve(event.relatedTarget)) return
      const surface = surfaces.get(element)
      if (!surface) return
      surface.hovered = false
      updateMode(surface)
    }
    const onDown = (event: PointerEvent) => {
      if (document.hidden || event.button !== 0) return
      const element = resolve(event.target)
      if (!element) return
      const previous = pointers.get(event.pointerId)
      if (previous) release(previous, true)
      if (pointers.size >= 2) return
      const surface = getSurface(element)
      if (surface.pointerId !== null) return
      surface.pointerId = event.pointerId
      surface.origin = { x: event.clientX, y: event.clientY }
      surface.rect = element.getBoundingClientRect()
      surface.hovered = canHover(event)
      pointers.set(event.pointerId, surface)
      follow(surface, event)
      kick(surface)
    }
    const onMove = (event: PointerEvent) => {
      const active = pointers.get(event.pointerId)
      if (active) {
        if (event.pointerType === 'mouse' && event.buttons === 0) { release(active); return }
        if (unavailable(active.element)) { clear(active); return }
        follow(active, event)
      } else if (canHover(event) && !document.hidden) {
        const element = resolve(event.target)
        if (!element) return
        const surface = getSurface(element)
        surface.hovered = true
        surface.rect = element.getBoundingClientRect()
        follow(surface, event)
      }
    }
    const onUp = (event: PointerEvent) => {
      const surface = pointers.get(event.pointerId)
      if (surface) release(surface)
    }
    const onCancel = (event: PointerEvent) => {
      const surface = pointers.get(event.pointerId)
      if (surface) release(surface, true)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.hidden || event.repeat || event.altKey || event.ctrlKey || event.metaKey || !['Enter', ' '].includes(event.key)) return
      if (!(event.target instanceof Element) || !event.target.closest(interactive)) return
      const element = resolve(event.target)
      if (!element) return
      const surface = getSurface(element)
      if (surface.keyboardKey !== null) return
      surface.keyboardKey = event.key
      surface.target.lightX = 0.5
      surface.target.lightY = 0.5
      updateMode(surface)
      kick(surface)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      for (const surface of surfaces.values()) {
        if (surface.keyboardKey !== event.key) continue
        surface.keyboardKey = null
        updateMode(surface)
      }
    }
    const onFocusOut = (event: FocusEvent) => {
      const element = resolve(event.target)
      const surface = element && surfaces.get(element)
      if (surface?.keyboardKey) { surface.keyboardKey = null; updateMode(surface) }
    }
    const onVisibility = () => { if (document.hidden) clearAll() }
    const observer = new MutationObserver(() => {
      for (const surface of surfaces.values()) if (unavailable(surface.element) || !surface.element.hasAttribute('data-glass')) clear(surface)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'inert', 'data-glass-motion', 'data-glass'] })
    // Capture-phase observation survives nested stopPropagation without capturing
    // a pointer or preventing scrolling, slider changes, clicks or Space behavior.
    const passive = { passive: true, capture: true }
    document.addEventListener('pointerover', onOver, passive)
    document.addEventListener('pointerout', onOut, passive)
    document.addEventListener('pointerdown', onDown, passive)
    document.addEventListener('pointermove', onMove, passive)
    document.addEventListener('keydown', onKeyDown, passive)
    document.addEventListener('keyup', onKeyUp, passive)
    document.addEventListener('focusout', onFocusOut, passive)
    window.addEventListener('pointerup', onUp, passive)
    window.addEventListener('pointercancel', onCancel, passive)
    window.addEventListener('lostpointercapture', onCancel, passive)
    window.addEventListener('blur', clearAll)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onOut, true)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
      document.removeEventListener('focusout', onFocusOut, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('lostpointercapture', onCancel, true)
      window.removeEventListener('blur', clearAll)
      document.removeEventListener('visibilitychange', onVisibility)
      clearAll()
    }
  }, [enabled])
  return null
}
