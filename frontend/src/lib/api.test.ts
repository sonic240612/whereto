import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { createVisit, deleteVisit, exportVisits, fetchVisits, importVisits, resetVisits, restoreVisit, StorageError, updateVisit } from './api.ts'
import type { StorageErrorCode } from './api.ts'
import type { Visit } from '../types/index.ts'

const key = 'whereto_visits'
const record: Visit = {
  id: 'original-record', name: '강남 산책', lat: 37.5, lng: 127.03,
  address: '서울 강남구', rating: 4, note: '다시 방문하기',
  photoUrl: null, photoId: null, createdAt: '2026-10-08T10:00:00.000Z',
}

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  failure: Error | null = null
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(name: string) { return this.values.get(name) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(name: string) { this.values.delete(name) }
  setItem(name: string, value: string) {
    if (this.failure) throw this.failure
    this.values.set(name, value)
  }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
})

const hasCode = (code: StorageErrorCode) => (error: unknown) => {
  assert.ok(error instanceof StorageError)
  assert.equal(error.code, code)
  return true
}

const input = { name: '새 장소', address: '서울 강남구 역삼동', rating: 5, note: '', lat: 37.51, lng: 127.04 }

test('empty storage reads as an empty list and legacy arrays remain readable', async () => {
  assert.deepEqual(await fetchVisits(), [])
  storage.setItem(key, JSON.stringify([record]))
  assert.deepEqual(await fetchVisits(), [record])
  await createVisit(input)
  assert.equal(JSON.parse(storage.getItem(key)!).version, 1)
  assert.equal((await fetchVisits()).length, 2)
})

test('concurrent saves in one tab do not lose records', async () => {
  await Promise.all([createVisit(input), createVisit({ ...input, name: '두 번째' })])
  const visits = await fetchVisits()
  assert.equal(visits.length, 2)
  assert.equal(new Set(visits.map((visit) => visit.id)).size, 2)
})

test('invalid JSON is reported with its exact original and cannot be overwritten by any mutation', async () => {
  const raw = '{broken record'
  storage.setItem(key, raw)
  await assert.rejects(fetchVisits(), (error) => {
    assert.ok(error instanceof StorageError)
    assert.equal(error.code, 'corrupt')
    assert.equal(error.rawData, raw)
    return true
  })
  await assert.rejects(createVisit(input), hasCode('corrupt'))
  await assert.rejects(deleteVisit(record.id), hasCode('corrupt'))
  await assert.rejects(importVisits(JSON.stringify([record])), hasCode('corrupt'))
  await assert.rejects(restoreVisit(record), hasCode('corrupt'))
  assert.equal(storage.getItem(key), raw)
})

test('unsupported versions, non-arrays, duplicate IDs, and malformed records are rejected', async () => {
  for (const raw of [
    JSON.stringify({ version: 2, visits: [record] }),
    '{}', 'null', JSON.stringify([record, record]),
    JSON.stringify([{ ...record, lat: 91 }]),
    JSON.stringify([{ ...record, rating: 6 }]),
    JSON.stringify([{ ...record, createdAt: 'not a date' }]),
    JSON.stringify([{ ...record, note: 5 }]),
  ]) {
    storage.setItem(key, raw)
    await assert.rejects(fetchVisits(), StorageError)
    assert.equal(storage.getItem(key), raw)
  }
})

test('input validation rejects non-finite coordinates, blank addresses, and invalid ratings before writing', async () => {
  for (const bad of [
    { ...input, lat: Infinity }, { ...input, lng: -181 },
    { ...input, address: '   ' }, { ...input, rating: 0 },
    { ...input, rating: 2.5 }, { ...input, name: 'x'.repeat(201) },
  ]) await assert.rejects(createVisit(bad), hasCode('invalid'))
  assert.equal(storage.getItem(key), null)
})

test('write quota errors preserve existing records and explain browser storage', async () => {
  const raw = JSON.stringify([record])
  storage.setItem(key, raw)
  storage.failure = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
  await assert.rejects(createVisit(input), hasCode('quota'))
  assert.equal(storage.getItem(key), raw)
})

test('unavailable browser storage is a distinct actionable error', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
  await assert.rejects(fetchVisits(), hasCode('unavailable'))
})

test('editing preserves coordinates, ID and creation time', async () => {
  storage.setItem(key, JSON.stringify([record]))
  const updated = await updateVisit(record.id, { name: ' 수정한 장소 ', address: record.address, rating: 2, note: ' 새 메모 ' })
  assert.deepEqual(updated, { ...record, name: '수정한 장소', rating: 2, note: '새 메모' })
  await assert.rejects(updateVisit('missing', input), hasCode('conflict'))
})

test('delete and undo restore the exact record without duplicating repeated undo', async () => {
  storage.setItem(key, JSON.stringify([record]))
  assert.deepEqual(await deleteVisit(record.id), record)
  assert.equal(await deleteVisit(record.id), null)
  assert.deepEqual(await fetchVisits(), [])
  await restoreVisit(record)
  await restoreVisit(record)
  assert.deepEqual(await fetchVisits(), [record])
  await assert.rejects(restoreVisit({ ...record, note: '다른 내용' }), hasCode('conflict'))
})

test('delete returns the latest stored record so undo preserves edits from another tab', async () => {
  storage.setItem(key, JSON.stringify([{ ...record, note: '다른 창에서 수정한 내용' }]))
  const removed = await deleteVisit(record.id)
  assert.ok(removed)
  await restoreVisit(removed)
  assert.equal((await fetchVisits())[0].note, '다른 창에서 수정한 내용')
})

test('export and reimport are lossless and skip existing or equivalent records', async () => {
  storage.setItem(key, JSON.stringify([record]))
  const backup = await exportVisits()
  assert.equal(JSON.parse(backup).version, 1)
  storage.clear()
  assert.deepEqual(await importVisits(backup), { added: 1, skipped: 0 })
  assert.deepEqual(await fetchVisits(), [record])
  assert.deepEqual(await importVisits(backup), { added: 0, skipped: 1 })
  assert.deepEqual(await importVisits(JSON.stringify([{ ...record, id: 'different-id' }])), { added: 0, skipped: 1 })
})

test('importing different contents with an existing ID keeps both records', async () => {
  storage.setItem(key, JSON.stringify([record]))
  assert.deepEqual(await importVisits(JSON.stringify([{ ...record, note: '다른 기기의 메모' }])), { added: 1, skipped: 0 })
  const visits = await fetchVisits()
  assert.equal(visits.length, 2)
  assert.deepEqual(visits[0], record)
  assert.notEqual(visits[1].id, record.id)
  assert.equal(visits[1].note, '다른 기기의 메모')
})

test('invalid imports never partially merge or change saved records', async () => {
  const raw = JSON.stringify([record])
  storage.setItem(key, raw)
  await assert.rejects(importVisits(JSON.stringify([record, { ...record, id: 'bad', lng: 200 }])), hasCode('invalid'))
  await assert.rejects(importVisits('['), hasCode('invalid'))
  await assert.rejects(importVisits(' '.repeat(2_000_001)), hasCode('invalid'))
  assert.equal(storage.getItem(key), raw)
})

test('reset requires the same snapshot that the user reviewed', async () => {
  const raw = 'broken'
  storage.setItem(key, raw)
  storage.setItem(key, JSON.stringify([record]))
  await assert.rejects(resetVisits(raw), hasCode('conflict'))
  assert.deepEqual(await fetchVisits(), [record])
  storage.setItem(key, raw)
  await resetVisits(raw)
  assert.deepEqual(await fetchVisits(), [])
})
