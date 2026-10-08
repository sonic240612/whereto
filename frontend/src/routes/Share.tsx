import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, Ellipsis } from 'lucide-react'
import MapView from '../components/MapView'
import NavLinks from '../components/NavLinks'
import KakaoPlaceLink from '../components/KakaoPlaceLink'
import ResultPin from '../components/ResultPin'
import { addressAt } from '../lib/geocode'
import { parseLatLng } from '../lib/validation'
import { readPlaceMetadata } from '../lib/place-metadata'

export default function Share() {
  const [params] = useSearchParams()
  const query = params.toString()
  const point = useMemo(() => parseLatLng(new URLSearchParams(query)), [query])
  const suppliedAddress = params.get('address')?.trim() ?? ''
  const validAddress = suppliedAddress.length <= 2000
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [dockInset, setDockInset] = useState(164)
  const dockRef = useRef<HTMLElement>(null)
  const moreId = useId()
  const isValid = Boolean(point && validAddress)
  const place = point ? { ...point, address, ...readPlaceMetadata(params) } : null

  useEffect(() => {
    const dock = dockRef.current
    if (!dock) return
    const updateInset = () => setDockInset(Math.ceil(dock.offsetHeight + (parseFloat(getComputedStyle(dock).bottom) || 24) + 12))
    const observer = new ResizeObserver(updateInset)
    observer.observe(dock)
    updateInset()
    return () => observer.disconnect()
  }, [isValid])

  useEffect(() => {
    setAddress('')
    setError('')
    if (!point || !validAddress) return
    // URLSearchParams has already decoded the value, including literal %.
    if (suppliedAddress) { setAddress(suppliedAddress); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      addressAt(point.lat, point.lng, controller.signal)
        .then(value => {
          if (!controller.signal.aborted) setAddress(value ?? '주소 정보가 없는 좌표')
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '주소를 불러오지 못했습니다.')
        })
    }, 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [point, suppliedAddress, validAddress, retry])

  if (!point || !place || !validAddress) return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-bold">잘못된 공유 링크입니다</h1>
      <p>올바른 위도·경도와 주소가 포함된 링크를 확인해주세요.</p>
      <Link to="/" className="rounded-xl bg-primary px-6 py-3 font-bold text-white">WhereTo 시작하기</Link>
    </main>
  )
  return (
    <main className="relative h-dvh overflow-hidden">
      <h1 className="sr-only">공유된 장소</h1>
      <MapView center={point} marker={point} bottomInset={dockInset} className="absolute inset-0" />
      <section data-glass="panel" ref={dockRef} aria-label="공유된 장소" className="absolute inset-x-3 z-10 mx-auto max-h-[70dvh] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur-sm" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        <div className="flex items-start gap-2">
          <ResultPin label="공유된 장소" address={address || (error ? '주소를 확인할 수 없습니다.' : '주소를 불러오는 중…')} expanded={expanded} />
          <button data-glass="action" type="button" aria-expanded={expanded} aria-controls={moreId} aria-label={expanded ? '장소 더보기 접기' : '장소 더보기'} onClick={() => setExpanded(value => !value)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-text-light hover:bg-bg-secondary">
            {expanded ? <ChevronDown size={20} aria-hidden="true" /> : <Ellipsis size={22} aria-hidden="true" />}
          </button>
        </div>
        {error && <div role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 [overflow-wrap:anywhere]">{error}<button data-glass="action" type="button" className="ml-3 min-h-11 font-semibold underline" onClick={() => setRetry(value => value + 1)}>재시도</button></div>}
        <div className="mt-3 grid grid-cols-2 items-end gap-2">
          <KakaoPlaceLink place={place} compact />
          <NavLinks {...place} compact />
          <Link data-glass="action" to="/" className="col-span-2 flex min-h-11 min-w-0 items-center justify-center rounded-xl border border-border px-3 py-2.5 text-center text-sm font-semibold">나도 뽑으러 가기</Link>
        </div>
        <div id={moreId} hidden={!expanded} className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-xs text-text-light [overflow-wrap:anywhere]">좌표 {point.lat.toFixed(6)}, {point.lng.toFixed(6)}</p>
          <p className="text-xs leading-relaxed text-text-light">길찾기를 열어 이동 경로와 실제 출입 가능 여부를 확인해주세요.</p>
        </div>
      </section>
    </main>
  )
}
