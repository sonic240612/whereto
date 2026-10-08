import { useEffect, useRef } from 'react'

// The owning element must have role="dialog", aria-modal and an accessible name.
export default function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = ref.current
    if (!dialog) return
    const elements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0)
    const focusInside = () => (elements()[0] ?? dialog).focus()
    focusInside()
    // Portalled dialogs must also hide the background from keyboard/AT navigation.
    const background = document.getElementById('root')
    const isolateBackground = background && !background.contains(dialog)
    const previousInert = background?.inert ?? false
    if (isolateBackground) background.inert = true
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const items = elements()
      if (!items.length) { event.preventDefault(); dialog.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    const focusin = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusInside()
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    return () => {
      document.body.style.overflow = oldOverflow
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focusin)
      if (isolateBackground) background.inert = previousInert
      previous?.focus()
    }
  }, [])
  return ref
}
