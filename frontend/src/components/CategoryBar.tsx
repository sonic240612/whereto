import { useCallback, useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { destinationCategories, type DestinationCategory } from '../lib/categories'
import useDesignTheme from '../hooks/useDesignTheme'
import { stepSpring, type SpringState } from '../lib/glass-spring'

interface CategoryBarProps {
  category: DestinationCategory
  onCategoryChange: (category: DestinationCategory) => void
  className?: string
}

export default function CategoryBar({ category, onCategoryChange, className = '' }: CategoryBarProps) {
  const { design, glassMotion } = useDesignTheme()
  const liquid = design === 'liquid'
  const descriptionId = useId()
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLSpanElement>(null)
  const retargetLens = useRef<(() => void) | null>(null)
  const buttonRefs = useRef(new Map<DestinationCategory, HTMLButtonElement>())
  const previousCategory = useRef<DestinationCategory | null>(null)
  const selected = destinationCategories.some(item => item.id === category) ? category : 'all'

  const reveal = useCallback((button: HTMLButtonElement, animate = false) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const view = viewport.getBoundingClientRect()
    const item = button.getBoundingClientRect()
    const delta = item.left < view.left + 4 ? item.left - view.left - 4
      : item.right > view.right - 4 ? item.right - view.right + 4 : 0
    if (Math.abs(delta) < 1) return
    const reducedMotion = liquid ? glassMotion === 'reduced' : window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Scroll only this row; focusing/restoring a category must not move the page.
    viewport.scrollTo({ left: viewport.scrollLeft + delta, behavior: animate && !reducedMotion ? 'smooth' : 'auto' })
  }, [liquid, glassMotion])

  useEffect(() => {
    const button = buttonRefs.current.get(selected)
    if (button) reveal(button, previousCategory.current !== null)
    previousCategory.current = selected
  }, [selected, reveal])

  useEffect(() => {
    if (!liquid) return
    const track = trackRef.current
    const lens = lensRef.current
    const viewport = viewportRef.current
    if (!track || !lens || !viewport) return
    const opticalSurface = lens.querySelector<HTMLElement>('[data-glass="lens"]')
    const originalPressure = opticalSurface?.getAttribute('data-glass-pressure') ?? null
    const originalPressureStyle = opticalSurface?.style.getPropertyValue('--glass-pressure') ?? ''
    const reducedMotion = glassMotion === 'reduced'
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
    let disposed = false
    let frame = 0
    let lastTime = 0
    let initialized = false
    let targetX = 0
    let targetWidth = 0
    let x: SpringState = { value: 0, velocity: 0 }
    let width: SpringState = { value: 0, velocity: 0 }
    let scaleX: SpringState = { value: 1, velocity: 0 }
    let scaleY: SpringState = { value: 1, velocity: 0 }
    let rotation: SpringState = { value: 0, velocity: 0 }
    let pressure: SpringState = { value: 0, velocity: 0 }
    let press: { button: HTMLButtonElement; pointerId: number | null; x: number; y: number } | null = null
    const settle = (state: SpringState, target: number, tolerance: number): SpringState =>
      Math.abs(state.value - target) < tolerance && Math.abs(state.velocity) < tolerance * 4
        ? { value: target, velocity: 0 } : state
    const paint = () => {
      lens.style.width = `${Math.max(1, width.value)}px`
      lens.style.transform = `translate3d(${x.value.toFixed(3)}px, 0, 0) scale(${clamp(scaleX.value, 0.965, 1.16).toFixed(5)}, ${clamp(scaleY.value, 0.93, 1.04).toFixed(5)}) rotate(${clamp(rotation.value, -1.1, 1.1).toFixed(4)}deg)`
      if (opticalSurface) {
        const value = clamp(pressure.value, 0, 1).toFixed(3)
        opticalSurface.style.setProperty('--glass-pressure', value)
        if (opticalSurface.getAttribute('data-glass-pressure') !== value) opticalSurface.setAttribute('data-glass-pressure', value)
      }
      lens.setAttribute('data-ready', '')
    }
    const animate = (time: number) => {
      frame = 0
      if (disposed) return
      const elapsed = lastTime ? (time - lastTime) / 1000 : 1 / 60
      lastTime = time
      x = settle(stepSpring(x, targetX, elapsed, { stiffness: 320, damping: 27 }), targetX, 0.025)
      width = settle(stepSpring(width, targetWidth, elapsed, { stiffness: 340, damping: 30 }), targetWidth, 0.025)
      // Movement stretches the glass along its direction of travel. Pressing
      // compresses it; the underdamped springs rebound after release.
      const speed = Math.abs(x.velocity)
      const compression = press ? 0.025 : 0
      const targetScaleX = clamp(1 + speed * 0.00013 - compression, 0.965, 1.16)
      const targetScaleY = clamp(1 - speed * 0.000055 - compression, 0.93, 1)
      const targetRotation = clamp(-x.velocity * 0.0007, -1.1, 1.1)
      scaleX = settle(stepSpring(scaleX, targetScaleX, elapsed, { stiffness: 420, damping: 25 }), targetScaleX, 0.0002)
      scaleY = settle(stepSpring(scaleY, targetScaleY, elapsed, { stiffness: 420, damping: 25 }), targetScaleY, 0.0002)
      rotation = settle(stepSpring(rotation, targetRotation, elapsed, { stiffness: 380, damping: 26 }), targetRotation, 0.002)
      const targetPressure = press ? 1 : 0
      pressure = settle(stepSpring(pressure, targetPressure, elapsed, { stiffness: 420, damping: 25 }), targetPressure, 0.001)
      paint()
      if (x.value !== targetX || width.value !== targetWidth || x.velocity !== 0 || width.velocity !== 0
        || scaleX.value !== targetScaleX || scaleY.value !== targetScaleY || rotation.value !== targetRotation
        || scaleX.velocity !== 0 || scaleY.velocity !== 0 || rotation.velocity !== 0
        || pressure.value !== targetPressure || pressure.velocity !== 0) {
        frame = requestAnimationFrame(animate)
      } else lastTime = 0
    }
    const retarget = () => {
      if (disposed) return
      const button = press?.button ?? track.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      if (!button) return
      // Coordinates are within the scrolling track, so native swiping carries
      // the lens and the text together without per-scroll layout reads.
      targetX = button.offsetLeft
      targetWidth = button.offsetWidth
      if (!initialized || reducedMotion) {
        cancelAnimationFrame(frame)
        frame = 0
        lastTime = 0
        initialized = true
        x = { value: targetX, velocity: 0 }
        width = { value: targetWidth, velocity: 0 }
        scaleX = { value: 1, velocity: 0 }
        scaleY = { value: 1, velocity: 0 }
        rotation = { value: 0, velocity: 0 }
        pressure = { value: 0, velocity: 0 }
        paint()
      } else if (!frame) frame = requestAnimationFrame(animate)
    }
    const release = (bounce = false) => {
      if (!press) return
      press = null
      if (bounce && !reducedMotion) {
        // A short outward impulse makes even a quick tap visibly release.
        scaleX = { ...scaleX, velocity: Math.max(scaleX.velocity, 0.42) }
        scaleY = { ...scaleY, velocity: Math.max(scaleY.velocity, 0.38) }
      }
      retarget()
    }
    const tabFrom = (target: EventTarget | null) => {
      const button = target instanceof Element ? target.closest<HTMLButtonElement>('[data-category-tab]') : null
      return button && track.contains(button) && !button.disabled ? button : null
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return
      const button = tabFrom(event.target)
      if (!button) return
      press = { button, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      retarget()
    }
    const anotherPointer = (event: PointerEvent) => {
      if (press && press.pointerId !== null && event.pointerId !== press.pointerId) release()
    }
    const move = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 6
        || (event.pointerType === 'mouse' && event.buttons === 0)) release()
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId === press?.pointerId) release(true)
    }
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === press?.pointerId) release()
    }
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (!['Enter', ' '].includes(event.key)) { release(); return }
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      const button = tabFrom(event.target)
      if (!button) return
      press = { button, pointerId: null, x: 0, y: 0 }
      retarget()
    }
    const keyUp = (event: globalThis.KeyboardEvent) => {
      if (press?.pointerId === null && ['Enter', ' '].includes(event.key)) release(true)
    }
    const cancelPress = () => release()
    const focusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !viewport.contains(event.relatedTarget)) release()
    }
    const onVisibility = () => { if (document.hidden) release() }
    const passive = { passive: true, capture: true }
    retargetLens.current = retarget
    const observer = new ResizeObserver(retarget)
    observer.observe(viewport)
    observer.observe(track)
    buttonRefs.current.forEach(button => observer.observe(button))
    // These observers never capture a pointer or prevent a native gesture.
    // The existing row scrolling and click handlers remain the only owners of
    // navigation; a preview never calls onCategoryChange.
    viewport.addEventListener('pointerdown', down, passive)
    viewport.addEventListener('scroll', cancelPress, { passive: true })
    viewport.addEventListener('lostpointercapture', cancel, passive)
    viewport.addEventListener('keydown', keyDown)
    viewport.addEventListener('focusout', focusOut)
    window.addEventListener('pointerdown', anotherPointer, passive)
    window.addEventListener('pointermove', move, passive)
    window.addEventListener('pointerup', up, passive)
    window.addEventListener('pointercancel', cancel, passive)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', cancelPress)
    document.addEventListener('visibilitychange', onVisibility)
    retarget()
    void document.fonts.ready.then(retarget)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      viewport.removeEventListener('pointerdown', down, true)
      viewport.removeEventListener('scroll', cancelPress)
      viewport.removeEventListener('lostpointercapture', cancel, true)
      viewport.removeEventListener('keydown', keyDown)
      viewport.removeEventListener('focusout', focusOut)
      window.removeEventListener('pointerdown', anotherPointer, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', cancelPress)
      document.removeEventListener('visibilitychange', onVisibility)
      lens.removeAttribute('data-ready')
      lens.style.removeProperty('transform')
      lens.style.removeProperty('width')
      if (opticalSurface) {
        if (originalPressure === null) opticalSurface.removeAttribute('data-glass-pressure')
        else opticalSurface.setAttribute('data-glass-pressure', originalPressure)
        if (originalPressureStyle) opticalSurface.style.setProperty('--glass-pressure', originalPressureStyle)
        else opticalSurface.style.removeProperty('--glass-pressure')
      }
      retargetLens.current = null
    }
  }, [liquid, glassMotion])

  useEffect(() => { retargetLens.current?.() }, [selected])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || viewport.scrollWidth <= viewport.clientWidth) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit
      const left = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, viewport.scrollLeft + delta))
      if (Math.abs(left - viewport.scrollLeft) < 1) return
      event.preventDefault()
      viewport.scrollLeft = left
    }
    // A non-passive native listener lets a mouse wheel move the category row.
    viewport.addEventListener('wheel', wheel, { passive: false })
    return () => viewport.removeEventListener('wheel', wheel)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let drag: { pointerId: number; x: number; scrollLeft: number; moved: boolean } | null = null
    let suppressClickUntil = 0
    const down = (event: PointerEvent) => {
      // Touch and pen keep the browser's native swipe and pinch handling.
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      suppressClickUntil = 0
      drag = { pointerId: event.pointerId, x: event.clientX, scrollLeft: viewport.scrollLeft, moved: false }
    }
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const delta = event.clientX - drag.x
      if (!drag.moved && Math.abs(delta) < 6) return
      if (!drag.moved) {
        drag.moved = true
        viewport.setPointerCapture(event.pointerId)
      }
      event.preventDefault()
      viewport.scrollLeft = drag.scrollLeft - delta
    }
    const finish = () => {
      if (!drag) return
      const current = drag
      drag = null
      if (current.moved) suppressClickUntil = performance.now() + 500
      if (viewport.hasPointerCapture(current.pointerId)) viewport.releasePointerCapture(current.pointerId)
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId === drag?.pointerId) finish()
    }
    const click = (event: MouseEvent) => {
      if (event.detail > 0 && performance.now() < suppressClickUntil) {
        event.preventDefault()
        event.stopPropagation()
        suppressClickUntil = 0
      }
    }
    viewport.addEventListener('pointerdown', down)
    viewport.addEventListener('lostpointercapture', up)
    viewport.addEventListener('click', click, true)
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', finish)
    return () => {
      viewport.removeEventListener('pointerdown', down)
      viewport.removeEventListener('lostpointercapture', up)
      viewport.removeEventListener('click', click, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', finish)
      finish()
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => {
      const button = buttonRefs.current.get(selected)
      if (button) reveal(button)
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [selected, reveal])

  const moveSelection = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    let next: number
    if (event.key === 'ArrowRight') next = (index + 1) % destinationCategories.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + destinationCategories.length) % destinationCategories.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = destinationCategories.length - 1
    else return
    event.preventDefault()
    event.stopPropagation()
    const choice = destinationCategories[next].id
    const button = buttonRefs.current.get(choice)
    button?.focus({ preventScroll: true })
    if (button) reveal(button, true)
    if (choice !== selected) onCategoryChange(choice)
  }

  return (
    <div className={`pointer-events-auto min-w-0 ${className}`}>
      <p id={descriptionId} className="sr-only">좌우로 밀거나 마우스 휠로 더 많은 분류를 볼 수 있습니다. 좌우 방향키로 하나를 선택하고 Home, End 키로 처음과 끝으로 이동합니다.</p>
      <div data-glass={liquid ? 'category' : undefined}>
      <div ref={viewportRef} data-category-viewport role="radiogroup" aria-label="추첨할 장소 분류" aria-describedby={descriptionId} aria-orientation="horizontal" className="w-full cursor-grab select-none overflow-x-auto overscroll-x-contain px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: 'pan-x pinch-zoom' }}>
        <div ref={trackRef} data-category-track className="relative flex w-max min-w-full flex-nowrap gap-2">
        {liquid && <span ref={lensRef} data-category-lens aria-hidden="true"><span data-glass="lens" /></span>}
        {destinationCategories.map((item, index) => {
          const active = item.id === selected
          return (
            <button key={item.id} ref={(button) => {
              if (button) buttonRefs.current.set(item.id, button)
              else buttonRefs.current.delete(item.id)
            }} data-category-tab type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1} onClick={() => { if (!active) onCategoryChange(item.id) }} onFocus={(event) => reveal(event.currentTarget)} onKeyDown={(event) => moveSelection(event, index)} className={`flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold shadow-md backdrop-blur-sm transition-colors focus-visible:outline-offset-[-3px] ${active ? 'border-text bg-text text-white' : 'border-white/80 bg-white/95 text-text hover:bg-bg-secondary'}`}>
              {item.label}
            </button>
          )
        })}
        </div>
      </div>
      </div>
    </div>
  )
}
