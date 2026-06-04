import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HistoryEntryMeta, TranscriptResult } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteEntry, getEntry, listEntries, saveEntry } from './store'

vi.mock('electron', () => ({
  app: { getPath: () => 'test-user-data' }
}))

const result: TranscriptResult = {
  language: 'ko',
  segments: [{ start: 0, end: 1, text: '안녕', words: [] }]
}

function meta(id: string, createdAt: number): HistoryEntryMeta {
  return {
    id,
    name: `${id}.mp4`,
    sourcePath: `/media/${id}.mp4`,
    language: 'ko',
    model: 'base',
    createdAt,
    segmentCount: 1
  }
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'captionx-history-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('saveEntry / getEntry', () => {
  it('저장한 항목을 그대로 읽어온다', async () => {
    await saveEntry(dir, meta('a', 1), result)
    const entry = await getEntry(dir, 'a')
    expect(entry?.meta.name).toBe('a.mp4')
    expect(entry?.result.segments).toHaveLength(1)
  })

  it('없는 항목은 null 을 반환한다', async () => {
    expect(await getEntry(dir, 'missing')).toBeNull()
  })

  it('경로 구분자가 든 id 는 거부한다', async () => {
    await expect(saveEntry(dir, meta('../evil', 1), result)).rejects.toThrow()
    expect(await getEntry(dir, '../evil')).toBeNull()
  })
})

describe('listEntries', () => {
  it('디렉터리가 없으면 빈 배열', async () => {
    expect(await listEntries(join(dir, 'nope'))).toEqual([])
  })

  it('최신순(createdAt 내림차순)으로 정렬한다', async () => {
    await saveEntry(dir, meta('old', 100), result)
    await saveEntry(dir, meta('new', 200), result)
    const list = await listEntries(dir)
    expect(list.map((m) => m.id)).toEqual(['new', 'old'])
  })

  it('손상된 JSON 파일은 건너뛴다', async () => {
    await saveEntry(dir, meta('ok', 1), result)
    await writeFile(join(dir, 'broken.json'), '{ not json', 'utf-8')
    const list = await listEntries(dir)
    expect(list.map((m) => m.id)).toEqual(['ok'])
  })
})

describe('deleteEntry', () => {
  it('항목을 삭제한다', async () => {
    await saveEntry(dir, meta('a', 1), result)
    await deleteEntry(dir, 'a')
    expect(await getEntry(dir, 'a')).toBeNull()
  })

  it('없는 항목 삭제는 조용히 무시한다', async () => {
    await expect(deleteEntry(dir, 'missing')).resolves.toBeUndefined()
  })
})
