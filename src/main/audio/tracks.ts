import { spawn } from 'node:child_process'
import type { AudioTrack } from '@shared/types'
import { resolveFfmpegPath } from './decode'

/**
 * ffmpeg `-i` 의 stderr 스트림 덤프에서 오디오 트랙 목록을 파싱한다(순수 함수).
 *
 * ffmpeg는 입력만 주고 출력이 없으면 스트림 정보를 stderr로 찍고 종료한다. 예:
 *   Stream #0:1(eng): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 160 kb/s
 *   Stream #0:2(kor): Audio: ac3, 48000 Hz, 5.1(side), fltp, 384 kb/s (metadata...)
 *
 * 반환하는 index는 "오디오 트랙들 중 순번"(0,1,2…)이며, ffmpeg `-map 0:a:{index}`
 * 에 그대로 쓴다. 컨테이너 전역 스트림 번호(0:1, 0:2)와는 의도적으로 다르다.
 *
 * 바로 다음 줄의 들여쓰기된 `title :` 메타데이터도 트랙 제목으로 흡수한다.
 */
export function parseAudioStreams(stderr: string): AudioTrack[] {
  const tracks: AudioTrack[] = []
  const lines = stderr.split(/\r?\n/)
  // 오디오 스트림 헤더: Stream #<file>:<stream>[[0xID]][(lang)]: Audio: <codec> ...
  // mp4/ts 등은 스트림 번호 뒤에 16진 식별자([0x1])를 덧붙이므로 이를 선택적으로 흡수한다.
  const streamRe = /^\s*Stream #\d+:\d+(?:\[0x[0-9a-fA-F]+\])?(?:\((\w+)\))?: Audio:\s*([^\s,(]+)/
  // 채널 레이아웃 토큰. 흔한 표기를 채널 수로 환산한다.
  const channelMap: Record<string, number> = {
    mono: 1,
    stereo: 2,
    downmix: 2,
    '2.1': 3,
    quad: 4,
    '4.0': 4,
    '5.0': 5,
    '5.1': 6,
    '5.1(side)': 6,
    '6.1': 7,
    '7.1': 8
  }

  let audioIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(streamRe)
    if (!m) continue
    const [, lang, codec] = m
    const rest = lines[i]
    let channels = 0
    for (const [token, count] of Object.entries(channelMap)) {
      if (rest.includes(`, ${token}`) || rest.includes(`, ${token},`)) {
        channels = count
        break
      }
    }
    // "N channels" 표기 폴백.
    if (channels === 0) {
      const cm = rest.match(/,\s*(\d+)\s*channels/)
      if (cm) channels = Number(cm[1])
    }

    // 다음 줄들의 들여쓰기된 title 메타데이터를 같은 트랙 제목으로 본다.
    let title: string | undefined
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*Stream #/.test(lines[j])) break
      const tm = lines[j].match(/^\s*title\s*:\s*(.+?)\s*$/i)
      if (tm) {
        title = tm[1]
        break
      }
      // 메타데이터 블록을 벗어나면(들여쓰기 없는 줄) 중단.
      if (!/^\s/.test(lines[j]) && lines[j].trim() !== '') break
    }

    tracks.push({
      index: audioIndex++,
      codec,
      channels,
      language: lang,
      title
    })
  }
  return tracks
}

/**
 * 입력 미디어의 오디오 트랙 목록을 ffmpeg로 조사한다.
 * ffprobe 바이너리에 의존하지 않고 ffmpeg-static 만으로 동작한다.
 *
 * 출력 없이 `-i` 만 주면 ffmpeg는 스트림 정보를 stderr로 덤프하고 비정상 종료(에러)
 * 한다. 이는 정상 흐름이므로 종료 코드와 무관하게 stderr를 파싱한다.
 */
export function probeAudioTracks(filePath: string): Promise<AudioTrack[]> {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-i', filePath]
    const proc = spawn(resolveFfmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
    proc.on('error', reject)
    proc.on('close', () => {
      try {
        resolve(parseAudioStreams(stderr))
      } catch (err) {
        reject(err as Error)
      }
    })
  })
}
