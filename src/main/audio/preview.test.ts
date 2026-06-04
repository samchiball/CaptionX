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
const { preparePreviewAudio, parseAudioCodec, copyPlanFor } = await import('./preview')

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

/** 브라우저 호환 코덱(AAC) m4a 샘플을 생성한다(stream copy 경로 검증용). */
async function makeAacAudio(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      resolveFfmpegPath(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=1',
        '-c:a',
        'aac',
        path
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    )
    proc.on('error', reject)
    proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`aac sample gen failed ${c}`))))
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

  it('이미 브라우저 호환 코덱(AAC)이면 재인코딩 없이 copy로 추출한다', async () => {
    const aac = join(USER_DATA, 'sample-aac.m4a')
    await makeAacAudio(aac)
    const out = await preparePreviewAudio(aac)
    expect(out.endsWith('.m4a')).toBe(true)
    expect((await stat(out)).size).toBeGreaterThan(0)
    expect(await partFiles()).toHaveLength(0)
  }, 30000)
})

describe('parseAudioCodec', () => {
  it('첫 오디오 스트림의 코덱명을 소문자로 파싱한다', () => {
    const stderr = [
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':",
      '  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p',
      '  Stream #0:1(eng): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo'
    ].join('\n')
    expect(parseAudioCodec(stderr)).toBe('aac')
  })

  it('오디오 스트림이 없으면 null', () => {
    expect(parseAudioCodec('  Stream #0:0: Video: h264')).toBeNull()
    expect(parseAudioCodec('')).toBeNull()
  })
})

describe('copyPlanFor', () => {
  it('브라우저 호환 코덱은 copy 계획을 돌려준다', () => {
    expect(copyPlanFor('aac')?.ext).toBe('m4a')
    expect(copyPlanFor('mp3')?.ext).toBe('mp3')
    expect(copyPlanFor('flac')?.ext).toBe('flac')
    expect(copyPlanFor('opus')?.ext).toBe('ogg')
    expect(copyPlanFor('vorbis')?.ext).toBe('ogg')
    expect(copyPlanFor('aac')?.args).toContain('copy')
  })

  it('비호환 코덱/미상은 null(재인코딩 폴백)', () => {
    expect(copyPlanFor('pcm_s16le')).toBeNull()
    expect(copyPlanFor('ac3')).toBeNull()
    expect(copyPlanFor(null)).toBeNull()
  })
})
