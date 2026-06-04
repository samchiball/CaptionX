import { spawn } from 'node:child_process'
import { readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveFfmpegPath } from './decode'

// electron app.getPath('userData')를 테스트용 임시 디렉터리로 대체한다.
const USER_DATA = join(tmpdir(), `captionx-preview-test-${process.pid}`)
vi.mock('electron', () => ({
  app: { getPath: () => USER_DATA }
}))

// 모킹 이후에 import해야 mock이 적용된다.
const { preparePreviewAudio } = await import('./preview')

const CACHE = join(USER_DATA, 'preview-cache')

/** 추출 대상으로 쓸 작은 실제 오디오(wav)를 생성한다. */
async function makeSampleAudio(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      resolveFfmpegPath(),
      ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=duration=1', path],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    )
    proc.on('error', reject)
    proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`sample gen failed ${c}`))))
  })
}

async function partFiles(): Promise<string[]> {
  try {
    return (await readdir(CACHE)).filter((f) => f.endsWith('.part'))
  } catch {
    return []
  }
}

describe('preparePreviewAudio', () => {
  let sample: string

  beforeAll(async () => {
    sample = join(USER_DATA, 'sample.wav')
    await rm(USER_DATA, { recursive: true, force: true })
    const { mkdir } = await import('node:fs/promises')
    await mkdir(USER_DATA, { recursive: true })
    await makeSampleAudio(sample)
  }, 30000)

  afterAll(async () => {
    await rm(USER_DATA, { recursive: true, force: true })
  })

  it('성공 시 m4a 캐시를 만들고 .part 임시 파일을 남기지 않는다', async () => {
    const out = await preparePreviewAudio(sample)
    expect(out.endsWith('.m4a')).toBe(true)
    expect((await stat(out)).size).toBeGreaterThan(0)
    expect(await partFiles()).toHaveLength(0)
  }, 30000)

  it('두 번째 호출은 캐시를 재사용한다(같은 경로 반환)', async () => {
    const a = await preparePreviewAudio(sample)
    const b = await preparePreviewAudio(sample)
    expect(a).toBe(b)
  }, 30000)

  it('추출 실패 시 손상된 캐시 파일을 남기지 않는다(.part도 정리)', async () => {
    const missing = join(USER_DATA, 'does-not-exist.mp4')
    await expect(preparePreviewAudio(missing)).rejects.toThrow()
    // 실패한 입력에 대한 캐시(.m4a)나 임시(.part) 파일이 남으면 안 된다.
    const files = await readdir(CACHE).catch(() => [])
    expect(files.some((f) => f.endsWith('.part'))).toBe(false)
    // 실패분이 .m4a로 굳어 다음 실행에서 재사용되지 않아야 한다(잘린 재생 버그 방지).
    expect(files.length).toBe(1) // 앞 테스트의 정상 sample 캐시 1개만 존재
  }, 30000)
})
