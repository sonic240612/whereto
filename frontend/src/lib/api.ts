import type { Visit } from '../types/index.ts'
import { isLatLng } from './validation.ts'

const STORAGE_KEY = 'whereto_visits'
// UTF-8 backups can be larger than localStorage's UTF-16 accounting, especially
// for Korean text. Every newly stored collection can be exported and reimported.
export const MAX_VISIT_BACKUP_BYTES = 20_000_000
const MAX_BACKUP_LABEL = `${MAX_VISIT_BACKUP_BYTES / 1_000_000}MB`
const MAX_VISITS = 10_000
const encoder = new TextEncoder()

export type StorageErrorCode = 'unavailable' | 'quota' | 'corrupt' | 'unsupported' | 'invalid' | 'conflict'

export class StorageError extends Error {
  readonly code: StorageErrorCode
  readonly rawData?: string

  constructor(code: StorageErrorCode, message: string, rawData?: string) {
    super(message)
    this.name = 'StorageError'
    this.code = code
    this.rawData = rawData
  }
}

export interface VisitDetails {
  name?: string
  address: string
  rating: number
  note?: string
}

function nullableText(value: unknown, maxLength: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= maxLength)
}

function isVisit(value: unknown): value is Visit {
  if (!value || typeof value !== 'object') return false
  const visit = value as Record<string, unknown>
  return isLatLng(value)
    && typeof visit.id === 'string' && visit.id.trim().length > 0 && visit.id.length <= 128
    && nullableText(visit.name, 200)
    && typeof visit.address === 'string' && visit.address.trim().length > 0 && visit.address.length <= 2000
    && typeof visit.rating === 'number' && Number.isInteger(visit.rating) && visit.rating >= 1 && visit.rating <= 5
    && nullableText(visit.note, 10_000)
    && nullableText(visit.photoUrl, 5000) && nullableText(visit.photoId, 500)
    && typeof visit.createdAt === 'string' && visit.createdAt.length <= 50
    && Number.isFinite(Date.parse(visit.createdAt))
}

function normalizeVisit(visit: Visit): Visit {
  return {
    id: visit.id,
    name: visit.name,
    lat: visit.lat,
    lng: visit.lng,
    address: visit.address,
    rating: visit.rating,
    note: visit.note,
    photoUrl: visit.photoUrl,
    photoId: visit.photoId,
    createdAt: new Date(visit.createdAt).toISOString(),
  }
}

function parseVisits(rawData: string, importing = false): Visit[] {
  const code = importing ? 'invalid' : 'corrupt'
  let parsed: unknown
  try {
    parsed = JSON.parse(rawData)
  } catch {
    throw new StorageError(code, importing ? '올바른 JSON 파일이 아닙니다.' : '방문 기록 파일이 손상되어 읽을 수 없습니다. 원본을 내보낸 뒤 복구하거나 초기화해주세요.', rawData)
  }
  let records: unknown = parsed
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const envelope = parsed as Record<string, unknown>
    if (envelope.version !== 1) {
      throw new StorageError(importing ? 'invalid' : 'unsupported', '지원하지 않는 방문 기록 형식입니다. 원본 데이터는 그대로 보존됩니다.', rawData)
    }
    records = envelope.visits
  }
  if (!Array.isArray(records) || records.length > MAX_VISITS || !records.every(isVisit)) {
    throw new StorageError(code, importing ? '방문 기록의 좌표, 날짜, 평점 또는 필수 항목이 올바르지 않습니다.' : '방문 기록에 잘못된 데이터가 있습니다. 원본을 내보낸 뒤 복구하거나 초기화해주세요.', rawData)
  }
  const ids = new Set(records.map((visit) => visit.id))
  if (ids.size !== records.length) {
    throw new StorageError(code, '방문 기록 ID가 중복되어 있습니다. 기존 데이터는 변경하지 않았습니다.', rawData)
  }
  return records.map(normalizeVisit)
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    throw new StorageError('unavailable', '이 브라우저에서 저장 공간에 접근할 수 없습니다. 브라우저의 사이트 데이터 설정을 확인한 뒤 다시 시도해주세요.')
  }
}

function readVisits(): Visit[] {
  const raw = readRaw()
  return raw === null ? [] : parseVisits(raw)
}

function serializeVisits(visits: Visit[]): string {
  if (visits.length > MAX_VISITS) {
    throw new StorageError('quota', '저장할 수 있는 기록 수를 초과했습니다. 먼저 기록을 내보내고 일부를 삭제해주세요.')
  }
  const raw = JSON.stringify({ version: 1, visits: visits.map(normalizeVisit) })
  if (encoder.encode(raw).byteLength > MAX_VISIT_BACKUP_BYTES) {
    throw new StorageError('quota', `방문 기록 전체 크기가 ${MAX_BACKUP_LABEL} 한도를 초과했습니다. 먼저 기록을 내보내고 일부를 삭제해주세요.`)
  }
  return raw
}

function writeVisits(visits: Visit[]): void {
  const raw = serializeVisits(visits)
  try {
    localStorage.setItem(STORAGE_KEY, raw)
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new StorageError('quota', '브라우저 저장 공간이 부족합니다. 방문 기록을 내보내고 불필요한 기록을 삭제한 뒤 다시 시도해주세요.')
    }
    throw new StorageError('unavailable', '방문 기록을 브라우저에 저장하지 못했습니다. 사이트 데이터 저장이 허용되어 있는지 확인해주세요.')
  }
}

async function withWriteLock<T>(operation: () => T): Promise<T> {
  try {
    // Serialize cooperating tabs for the entire read/compare/write operation.
    // Browsers without Web Locks still execute the fallback synchronously.
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request(STORAGE_KEY, { mode: 'exclusive' }, operation)
    }
    return operation()
  } catch (error) {
    if (error instanceof StorageError) throw error
    throw new StorageError('unavailable', '방문 기록 저장을 시작하지 못했습니다. 다른 창의 저장이 끝난 뒤 다시 시도해주세요.')
  }
}

function checkedDetails(data: VisitDetails): Pick<Visit, 'name' | 'address' | 'rating' | 'note'> {
  if ((data.name !== undefined && typeof data.name !== 'string')
    || typeof data.address !== 'string'
    || (data.note !== undefined && typeof data.note !== 'string')
    || !Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
    throw new StorageError('invalid', '장소 이름, 주소, 평점과 메모를 확인해주세요.')
  }
  const details = {
    name: data.name?.trim() || null,
    address: data.address.trim(),
    rating: data.rating,
    note: data.note?.trim() || null,
  }
  if (!details.address || details.address.length > 2000
    || (details.name?.length ?? 0) > 200 || (details.note?.length ?? 0) > 10_000) {
    throw new StorageError('invalid', '주소를 입력하고 장소 이름 200자, 주소 2,000자, 메모 10,000자 이내로 작성해주세요.')
  }
  return details
}

export async function fetchVisits(): Promise<Visit[]> {
  return readVisits()
}

export async function createVisit(data: VisitDetails & { lat: number; lng: number }): Promise<Visit> {
  if (!isLatLng(data)) throw new StorageError('invalid', '저장할 장소의 좌표가 올바르지 않습니다.')
  const details = checkedDetails(data)
  const newVisit: Visit = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...details,
    lat: data.lat,
    lng: data.lng,
    photoUrl: null,
    photoId: null,
  }
  return withWriteLock(() => {
    writeVisits([...readVisits(), newVisit])
    return newVisit
  })
}

export async function updateVisit(id: string, data: VisitDetails, expected: Visit): Promise<Visit> {
  const details = checkedDetails(data)
  if (!isVisit(expected) || expected.id !== id) throw new StorageError('invalid', '수정할 기록을 다시 열어주세요.')
  const expectedSnapshot = JSON.stringify(normalizeVisit(expected))
  return withWriteLock(() => {
    const visits = readVisits()
    const current = visits.find((visit) => visit.id === id)
    if (!current) throw new StorageError('conflict', '이 기록이 다른 창에서 삭제되었습니다. 입력한 내용을 보관한 뒤 방문 기록을 새로 불러와주세요.')
    if (JSON.stringify(current) !== expectedSnapshot) {
      throw new StorageError('conflict', '다른 창에서 이 기록이 변경되었습니다. 입력한 내용은 이 창에 남아 있습니다. 필요한 내용을 복사한 뒤 창을 닫고 최신 기록을 다시 열어주세요.')
    }
    const updated = { ...current, ...details }
    writeVisits(visits.map((visit) => visit.id === id ? updated : visit))
    return updated
  })
}

export async function deleteVisit(id: string): Promise<Visit | null> {
  return withWriteLock(() => {
    const visits = readVisits()
    const removed = visits.find((visit) => visit.id === id)
    if (!removed) return null
    writeVisits(visits.filter((visit) => visit.id !== id))
    return removed
  })
}

export async function restoreVisit(visit: Visit): Promise<void> {
  if (!isVisit(visit)) throw new StorageError('invalid', '복원할 방문 기록이 올바르지 않습니다.')
  const restored = normalizeVisit(visit)
  return withWriteLock(() => {
    const visits = readVisits()
    const current = visits.find((item) => item.id === restored.id)
    if (current) {
      if (JSON.stringify(current) === JSON.stringify(restored)) return
      throw new StorageError('conflict', '같은 ID의 다른 기록이 있어 복원하지 못했습니다. 현재 기록을 먼저 내보내주세요.')
    }
    writeVisits([...visits, restored])
  })
}

export async function exportVisits(): Promise<string> {
  return serializeVisits(readVisits())
}

export async function importVisits(rawData: string): Promise<{ added: number; skipped: number }> {
  if (encoder.encode(rawData).byteLength > MAX_VISIT_BACKUP_BYTES) {
    throw new StorageError('invalid', `가져올 파일이 너무 큽니다. ${MAX_BACKUP_LABEL} 이하의 방문 기록 JSON을 선택해주세요.`)
  }
  const incoming = parseVisits(rawData, true)
  return withWriteLock(() => {
    const visits = readVisits()
    const ids = new Set(visits.map((visit) => visit.id))
    const fingerprint = (visit: Visit) => JSON.stringify({ ...normalizeVisit(visit), id: undefined })
    const fingerprints = new Set(visits.map(fingerprint))
    let added = 0
    for (const visit of incoming) {
      const signature = fingerprint(visit)
      if (fingerprints.has(signature)) continue
      const id = ids.has(visit.id) ? crypto.randomUUID() : visit.id
      visits.push({ ...visit, id })
      ids.add(id)
      fingerprints.add(signature)
      added += 1
    }
    if (added > 0) writeVisits(visits)
    return { added, skipped: incoming.length - added }
  })
}

// The caller must explicitly confirm resetting this exact unreadable snapshot.
export async function resetVisits(expectedRawData: string): Promise<void> {
  return withWriteLock(() => {
    if (readRaw() !== expectedRawData) {
      throw new StorageError('conflict', '저장된 기록이 변경되었습니다. 다시 불러온 뒤 초기화 여부를 확인해주세요.')
    }
    writeVisits([])
  })
}
