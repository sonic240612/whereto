import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Star, Trash2, Calendar, MessageSquare, Pencil, Download, Upload, Undo2, RefreshCw } from 'lucide-react'
import VisitForm from '../components/VisitForm'
import { fetchVisits, deleteVisit, updateVisit, restoreVisit, exportVisits, importVisits, resetVisits, StorageError } from '../lib/api'
import type { Visit } from '../types'

const actionClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs font-semibold text-text transition-colors hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed'

function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다. 다시 시도해주세요.'
}

export default function Gallery() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Visit | null>(null)
  const [deleted, setDeleted] = useState<Visit[]>([])
  const [resetReady, setResetReady] = useState(false)
  const [resetConfirmed, setResetConfirmed] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const loadSequence = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    try {
      const records = await fetchVisits()
      if (sequence !== loadSequence.current) return
      setVisits(records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)))
      setLoadError(null)
      setResetReady(false)
      setResetConfirmed(false)
    } catch (cause) {
      if (sequence !== loadSequence.current) return
      setLoadError(cause instanceof Error ? cause : new Error(errorMessage(cause)))
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'whereto_visits') void reload()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      loadSequence.current += 1
      window.removeEventListener('storage', onStorage)
    }
  }, [reload])

  const reportError = (cause: unknown) => {
    setActionError(errorMessage(cause))
    if (cause instanceof StorageError && cause.rawData !== undefined && cause.code !== 'invalid') {
      setLoadError(cause)
      setResetReady(false)
      setResetConfirmed(false)
    }
  }

  const handleDelete = async (visit: Visit) => {
    if (busy) return
    setBusy(`delete-${visit.id}`)
    setActionError(null)
    try {
      const removed = await deleteVisit(visit.id)
      if (removed) setDeleted((previous) => [...previous, removed])
      setNotice(removed ? '방문 기록을 삭제했습니다. 이 화면을 떠나기 전까지 삭제를 취소할 수 있어요.' : '다른 창에서 이미 삭제된 기록입니다.')
      await reload()
    } catch (cause) {
      reportError(cause)
    } finally {
      setBusy(null)
    }
  }

  const handleUndo = async () => {
    const visit = deleted.at(-1)
    if (!visit || busy) return
    setBusy('undo')
    setActionError(null)
    try {
      await restoreVisit(visit)
      setDeleted((previous) => previous.slice(0, -1))
      setNotice('삭제한 방문 기록을 복원했습니다.')
      await reload()
    } catch (cause) {
      reportError(cause)
    } finally {
      setBusy(null)
    }
  }

  const handleExport = async () => {
    setBusy('export')
    setActionError(null)
    try {
      download(await exportVisits(), 'whereto-visits.json')
      setNotice('방문 기록 파일의 다운로드를 시작했습니다.')
    } catch (cause) {
      reportError(cause)
    } finally {
      setBusy(null)
    }
  }

  const handleImport = async (file: File) => {
    setBusy('import')
    setActionError(null)
    try {
      if (file.size > 2_000_000) throw new Error('2MB 이하의 방문 기록 JSON 파일을 선택해주세요.')
      const result = await importVisits(await file.text())
      setNotice(`${result.added}개 기록을 가져왔습니다. 중복 ${result.skipped}개는 건너뛰었습니다.`)
      await reload()
    } catch (cause) {
      reportError(cause)
    } finally {
      setBusy(null)
    }
  }

  const rawData = loadError instanceof StorageError ? loadError.rawData : undefined
  const handleReset = async () => {
    if (rawData === undefined || !resetConfirmed || busy) return
    setBusy('reset')
    setActionError(null)
    try {
      await resetVisits(rawData)
      setDeleted([])
      setNotice('저장 공간을 초기화했습니다. 백업 파일이 있다면 가져오기로 복구할 수 있어요.')
      await reload()
    } catch (cause) {
      reportError(cause)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="gallery-page min-h-dvh bg-bg-secondary">
      <div className="sticky top-0 z-20 glass-strong border-b border-border/50">
        <div className="flex h-[calc(env(safe-area-inset-top)+60px)] items-center pl-36 pr-16 pt-[env(safe-area-inset-top)]">
          <h1 className="text-lg font-extrabold text-text">방문 기록</h1>
        </div>
      </div>

      <main className="p-5 space-y-4 pb-8 max-w-3xl mx-auto">
        <section data-glass="panel" aria-label="기록 보관과 백업" className="rounded-2xl border border-border bg-white p-4 space-y-3">
          <p className="text-sm text-text-light leading-relaxed">기록은 현재 기기의 이 브라우저에만 저장됩니다. 브라우저 데이터 삭제나 기기 변경에 대비해 파일로 백업해주세요.</p>
          <div className="flex flex-wrap gap-2">
            <button data-glass="action" type="button" onClick={handleExport} disabled={loading || !!loadError || !!busy} className={actionClass}><Download size={15} aria-hidden="true" />내보내기</button>
            <button data-glass="action" type="button" onClick={() => importRef.current?.click()} disabled={loading || !!loadError || !!busy} className={actionClass}><Upload size={15} aria-hidden="true" />{busy === 'import' ? '가져오는 중...' : '가져오기'}</button>
            <button data-glass="action" type="button" onClick={() => void reload()} disabled={loading || !!busy} className={actionClass}><RefreshCw size={15} aria-hidden="true" />다시 불러오기</button>
            <input ref={importRef} type="file" accept=".json,application/json" className="hidden" aria-label="방문 기록 JSON 파일" onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void handleImport(file)
            }} />
          </div>
          <p className="text-xs text-text-light">가져온 기록은 기존 기록과 합쳐지며 같은 기록은 중복 저장하지 않습니다.</p>
        </section>

        {notice && <p role="status" className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-sm text-teal-800 break-words">{notice}</p>}
        {deleted.length > 0 && <button data-glass="action" type="button" onClick={handleUndo} disabled={!!busy || !!loadError} className={actionClass}><Undo2 size={15} aria-hidden="true" />최근 삭제 취소 ({deleted.length}개 남음)</button>}
        {actionError && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 break-words">{actionError}</p>}

        {loading && <p role="status" className="text-center py-12 text-text-light">방문 기록을 불러오는 중...</p>}

        {!loading && loadError && (
          <section aria-labelledby="storage-error-title" className="rounded-2xl border border-red-200 bg-white p-5 space-y-3">
            <h2 id="storage-error-title" className="font-bold text-text">방문 기록을 불러오지 못했어요</h2>
            <p role="alert" className="text-sm text-red-700 break-words">{loadError.message}</p>
            <button data-glass="action" type="button" onClick={() => void reload()} disabled={!!busy} className={actionClass}>다시 시도</button>
            {rawData !== undefined && <>
              <p className="text-sm text-text-light">원본 데이터는 그대로 보존되어 있습니다. 먼저 원본을 내려받아 보관해주세요. 정상적인 백업 파일은 초기화 후 가져올 수 있습니다.</p>
              <div className="flex flex-wrap gap-2">
                <button data-glass="action" type="button" onClick={() => {
                  try {
                    download(rawData, 'whereto-visits-recovery.json')
                    setNotice('보존된 원본 파일의 다운로드를 시작했습니다.')
                  } catch (cause) { reportError(cause) }
                }} disabled={!!busy} className={actionClass}><Download size={15} aria-hidden="true" />원본 내보내기</button>
                <button data-glass="action" type="button" onClick={() => setResetReady(!resetReady)} disabled={!!busy} className={actionClass}>{resetReady ? '초기화 취소' : '저장 공간 초기화'}</button>
              </div>
              {resetReady && <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                <label className="flex items-start gap-2 text-sm text-red-800"><input type="checkbox" checked={resetConfirmed} onChange={(event) => setResetConfirmed(event.target.checked)} className="mt-1" />초기화하면 이 브라우저의 원본 기록이 삭제됨을 확인했습니다.</label>
                <button data-glass="action" type="button" onClick={handleReset} disabled={!resetConfirmed || !!busy} className="rounded-xl px-4 py-2.5 text-sm font-bold bg-red-600 text-white disabled:opacity-40">원본을 지우고 초기화</button>
              </div>}
            </>}
          </section>
        )}

        {!loading && !loadError && visits.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-5 text-center">
            <MapPin size={36} className="text-text-light mb-4" aria-hidden="true" />
            <h2 className="text-base font-bold text-text mb-1.5">아직 방문 기록이 없어요</h2>
            <p className="text-sm text-text-light mb-6">장소를 뽑고 방문 기록을 남겨보세요.</p>
            <Link data-glass="accent" to="/" className="px-6 py-3 rounded-xl text-sm font-bold text-white bg-primary">장소 뽑으러 가기</Link>
          </div>
        )}

        {!loading && !loadError && visits.map((visit) => (
          <article data-glass="panel" key={visit.id} className="rounded-2xl bg-white overflow-hidden border border-border shadow-md">
            <div className="p-5 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-bold text-text leading-snug min-w-0 break-words">{visit.name || visit.address}</h2>
                <button data-glass="action" type="button" onClick={() => void handleDelete(visit)} disabled={!!busy} aria-label={`${visit.name || visit.address} 기록 삭제`} className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-red-50 text-text-light hover:text-red-500 disabled:opacity-40"><Trash2 size={17} aria-hidden="true" /></button>
              </div>
              <div className="flex items-start gap-2 text-sm text-text-light">
                <MapPin size={15} className="shrink-0 mt-0.5 text-primary" aria-hidden="true" /><p className="leading-relaxed min-w-0 break-words">{visit.address}</p>
              </div>
              <div className="flex gap-1" role="img" aria-label={`평점 5점 중 ${visit.rating}점`}>
                {[1, 2, 3, 4, 5].map((rating) => <Star key={rating} size={16} fill={rating <= visit.rating ? '#FF6B6B' : 'none'} className={rating <= visit.rating ? 'text-primary' : 'text-border'} aria-hidden="true" />)}
              </div>
              {visit.note && <div className="flex items-start gap-2 text-sm text-text-light bg-bg-secondary rounded-xl p-3"><MessageSquare size={15} className="shrink-0 mt-0.5" aria-hidden="true" /><p className="leading-relaxed min-w-0 whitespace-pre-wrap break-words">{visit.note}</p></div>}
              <div className="flex items-center gap-1.5 text-xs font-medium text-text-light"><Calendar size={13} aria-hidden="true" /><time dateTime={visit.createdAt}>{new Date(visit.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}</time></div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link to={`/share?${new URLSearchParams({ lat: String(visit.lat), lng: String(visit.lng), address: visit.address })}`} className={actionClass}><MapPin size={15} aria-hidden="true" />지도 열기</Link>
                <button data-glass="action" type="button" onClick={() => setEditing(visit)} disabled={!!busy} className={actionClass}><Pencil size={15} aria-hidden="true" />기록 수정</button>
              </div>
            </div>
          </article>
        ))}
      </main>

      {editing && <VisitForm key={editing.id} placeName={editing.name ?? ''} defaultAddress={editing.address} initialRating={editing.rating} initialNote={editing.note ?? ''} title="방문 기록 수정" submitLabel="수정 저장" onCancel={() => setEditing(null)} onSubmit={async (data) => {
        await updateVisit(editing.id, data)
        setEditing(null)
        setNotice('방문 기록을 수정했습니다.')
        await reload()
      }} />}
    </div>
  )
}
