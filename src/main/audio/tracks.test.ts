import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveFfmpegPath } from './decode'
import { parseAudioStreams, probeAudioTracks } from './tracks'

describe('parseAudioStreams', () => {
  it('여러 오디오 트랙을 0부터 매긴 순번으로 파싱한다', () => {
    const stderr = [
      "Input #0, mov,mp4, from 'movie.mp4':",
      '  Duration: 00:10:00.00, start: 0.000000, bitrate: 1500 kb/s',
      '  Stream #0:0(und): Video: h264 (High), yuv420p, 1920x1080, 1200 kb/s',
      '  Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp, 160 kb/s',
      '  Stream #0:2(kor): Audio: ac3, 48000 Hz, 5.1(side), fltp, 384 kb/s'
    ].join('\n')
    const tracks = parseAudioStreams(stderr)
    expect(tracks).toEqual([
      { index: 0, codec: 'aac', channels: 2, language: 'eng', title: undefined },
      { index: 1, codec: 'ac3', channels: 6, language: 'kor', title: undefined }
    ])
  })

  it('mp4/ts의 16진 스트림 식별자([0x1])가 붙어도 파싱한다', () => {
    const stderr = [
      '  Stream #0:0[0x1](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 70 kb/s (default)',
      '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 68 kb/s'
    ].join('\n')
    const tracks = parseAudioStreams(stderr)
    expect(tracks.map((t) => t.index)).toEqual([0, 1])
    expect(tracks[0].codec).toBe('aac')
    expect(tracks[0].channels).toBe(1)
    expect(tracks[1].channels).toBe(2)
  })

  it('비디오만 있고 오디오가 없으면 빈 배열', () => {
    const stderr = '  Stream #0:0: Video: h264, yuv420p, 1280x720'
    expect(parseAudioStreams(stderr)).toEqual([])
  })

  it('언어 태그가 없는 단일 모노 트랙을 파싱한다', () => {
    const stderr = '  Stream #0:0: Audio: mp3, 44100 Hz, mono, s16p, 128 kb/s'
    expect(parseAudioStreams(stderr)).toEqual([
      { index: 0, codec: 'mp3', channels: 1, language: undefined, title: undefined }
    ])
  })

  it('들여쓰기된 title 메타데이터를 트랙 제목으로 흡수한다', () => {
    const stderr = [
      '  Stream #0:1(eng): Audio: aac, 48000 Hz, stereo',
      '    Metadata:',
      '      title           : Director Commentary',
      '  Stream #0:2(eng): Audio: aac, 48000 Hz, stereo'
    ].join('\n')
    const tracks = parseAudioStreams(stderr)
    expect(tracks[0].title).toBe('Director Commentary')
    expect(tracks[1].title).toBeUndefined()
  })

  it('"N channels" 표기를 채널 수로 환산한다', () => {
    const stderr = '  Stream #0:0: Audio: pcm_s16le, 48000 Hz, 8 channels, s16'
    expect(parseAudioStreams(stderr)[0].channels).toBe(8)
  })
})

describe('probeAudioTracks (실제 ffmpeg)', () => {
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'captionx-tracks-'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  /** 모노 + 스테레오 두 오디오 트랙을 가진 실제 mkv를 생성한다. */
  async function makeTwoTrackMkv(path: string): Promise<void> {
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
          'sine=frequency=440:duration=1',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=880:duration=1',
          '-map',
          '0:a',
          '-ac:0',
          '1',
          '-map',
          '1:a',
          '-ac:1',
          '2',
          '-c:a',
          'aac',
          path
        ],
        { stdio: ['ignore', 'ignore', 'ignore'] }
      )
      proc.on('error', reject)
      proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`gen failed ${c}`))))
    })
  }

  it('실제 멀티트랙 파일에서 두 오디오 트랙을 0,1 순번으로 감지한다', async () => {
    const mkv = join(dir, 'two-track.mkv')
    await makeTwoTrackMkv(mkv)
    const tracks = await probeAudioTracks(mkv)
    expect(tracks).toHaveLength(2)
    expect(tracks.map((t) => t.index)).toEqual([0, 1])
    expect(tracks[0].channels).toBe(1)
    expect(tracks[1].channels).toBe(2)
  }, 30000)
})
