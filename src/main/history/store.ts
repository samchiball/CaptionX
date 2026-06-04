import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HistoryEntry, HistoryEntryMeta, TranscriptResult } from '@shared/types'
import { app } from 'electron'

/** 보관함 파일이 저장되는 디렉터리(앱 userData 하위). */
export function historyDir(): string {
  return join(app.getPath('userData'), 'history')
}

/**
 * id가 안전한 파일 이름(경로 구분자·상위 경로 없음)인지 확인한다.
 * 렌더러가 보낸 id로 임의 경로에 접근하는 것을 막는다.
 */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id)
}

function fileOf(dir: string, id: string): string {
  return join(dir, `${id}.json`)
}

/** 전사 결과 한 건을 `<id>.json`으로 저장한다(디렉터리는 자동 생성). */
export async function saveEntry(
  dir: string,
  meta: HistoryEntryMeta,
  result: TranscriptResult
): Promise<void> {
  if (!isSafeId(meta.id)) throw new Error('유효하지 않은 보관함 id 입니다.')
  await mkdir(dir, { recursive: true })
  const entry: HistoryEntry = { meta, result }
  await writeFile(fileOf(dir, meta.id), JSON.stringify(entry), 'utf-8')
}

/** 저장된 모든 항목의 메타데이터를 최신순으로 반환한다(본문 제외). */
export async function listEntries(dir: string): Promise<HistoryEntryMeta[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    // 디렉터리가 아직 없으면 빈 목록
    return []
  }
  const metas: HistoryEntryMeta[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = await readFile(join(dir, name), 'utf-8')
      const parsed = JSON.parse(raw) as Partial<HistoryEntry>
      if (parsed?.meta?.id) metas.push(parsed.meta)
    } catch {
      // 손상되거나 읽을 수 없는 파일은 건너뛴다.
    }
  }
  metas.sort((a, b) => b.createdAt - a.createdAt)
  return metas
}

/** 단일 항목(메타 + 본문)을 반환한다. 없으면 null. */
export async function getEntry(dir: string, id: string): Promise<HistoryEntry | null> {
  if (!isSafeId(id)) return null
  try {
    const raw = await readFile(fileOf(dir, id), 'utf-8')
    return JSON.parse(raw) as HistoryEntry
  } catch {
    return null
  }
}

/** 항목을 삭제한다. 없는 항목이면 조용히 무시한다. */
export async function deleteEntry(dir: string, id: string): Promise<void> {
  if (!isSafeId(id)) return
  await rm(fileOf(dir, id), { force: true })
}
