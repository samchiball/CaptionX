import { Buffer } from 'node:buffer'
import type { FileHandle } from 'node:fs/promises'
import { open, stat } from 'node:fs/promises'
import { isMediaPath, MEDIA_SCHEME } from '@shared/types'
import { protocol } from 'electron'

/** 확장자 → MIME 타입. seek/재생을 위해 정확한 Content-Type을 응답한다. */
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  opus: 'audio/opus',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo'
}

export function mimeFor(path: string): string {
  return MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

/** Range 헤더 해석 결과. */
export type RangeResolution =
  | { kind: 'full' }
  | { kind: 'partial'; start: number; end: number }
  | { kind: 'unsatisfiable' }

/**
 * `Range` 헤더(`bytes=start-end`)를 파일 크기에 맞춰 해석한다.
 * - 헤더 없음/형식 불일치 → 전체 응답(full)
 * - 유효 구간 → partial (양끝 포함, end는 size-1로 클램프)
 * - 범위 밖 → unsatisfiable(416)
 */
export function resolveRange(rangeHeader: string | null, size: number): RangeResolution {
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null
  if (!m) return { kind: 'full' }

  let start = m[1] ? Number.parseInt(m[1], 10) : 0
  let end = m[2] ? Number.parseInt(m[2], 10) : size - 1
  if (Number.isNaN(start)) start = 0
  if (Number.isNaN(end) || end >= size) end = size - 1
  if (start > end || start >= size || start < 0) return { kind: 'unsatisfiable' }
  return { kind: 'partial', start, end }
}

/**
 * 파일의 [start, end] 바이트(양끝 포함) 범위를 ArrayBuffer로 읽는다.
 * 단일 read는 요청 length보다 적게 읽을 수 있으므로(특히 큰 파일) 채워질 때까지
 * 반복 읽어 요청 구간 전체를 보장한다. (부족하면 잘린 Content-Length로 재생이 멈춤)
 */
export async function readSlice(
  filePath: string,
  start: number,
  end: number
): Promise<ArrayBuffer> {
  const length = end - start + 1
  const view = new Uint8Array(Math.max(length, 0))
  const fh = await open(filePath, 'r')
  try {
    let off = 0
    while (off < length) {
      const { bytesRead } = await fh.read(view, off, length - off, start + off)
      if (bytesRead === 0) break // EOF
      off += bytesRead
    }
    return off === length ? view.buffer : view.buffer.slice(0, off)
  } finally {
    await fh.close()
  }
}

/**
 * 커스텀 스킴을 권한 있는(스트리밍 가능) 스킴으로 등록한다.
 * 반드시 app.whenReady() **이전**에 호출해야 한다.
 */
export function registerMediaSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        stream: true, // Range 요청 기반 seek 지원
        supportFetchAPI: true,
        bypassCSP: true,
        secure: true
      }
    }
  ])
}

/** 스트리밍 청크 크기(256KiB). 한 번의 pull에서 읽는 최대 바이트. */
const STREAM_CHUNK = 256 * 1024

/**
 * 파일의 [start, end] 바이트(양끝 포함)를 pull 기반 ReadableStream으로 노출한다.
 *
 * Chromium 미디어 엘리먼트는 재생/seek 중 Range 요청을 점진적으로 여러 번 보낸다.
 * 요청 구간 전체를 하나의 ArrayBuffer로 만들어 반환하면, 그 큰 단일 Response가
 * Electron 미디어 파이프라인을 흘러가다 stall되어 "재생되다 같은 지점에서 멈춤"이
 * 발생한다. 또 `Readable.toWeb`은 eager-push라 백프레셔와 맞물려 첫 청크 이후 stall된다.
 *
 * 그래서 소비자(Chromium)가 더 달라고 `pull`을 호출할 때만 한 청크씩 읽어 enqueue한다.
 * 이렇게 하면 백프레셔를 존중하므로 stall 없이 끝까지 재생된다. 파일 핸들은 구간을 다
 * 보냈거나(close) 소비자가 취소하면(cancel) 정리한다.
 */
export function fileRangeStream(
  filePath: string,
  start: number,
  end: number
): ReadableStream<Uint8Array> {
  let fh: FileHandle | null = null
  let pos = start
  let cancelled = false

  const closeHandle = async (): Promise<void> => {
    if (fh) {
      const h = fh
      fh = null
      try {
        await h.close()
      } catch {
        // Ignore close errors if already closed
      }
    }
  }

  return new ReadableStream<Uint8Array>({
    start() {
      // Open the file handle lazily in pull to avoid leaks if stream is discarded before pull.
    },
    async pull(controller) {
      try {
        if (cancelled) return
        if (!fh) {
          const handle = await open(filePath, 'r')
          if (cancelled) {
            await handle.close()
            return
          }
          fh = handle
        }
        const remaining = end - pos + 1
        if (remaining <= 0) {
          controller.close()
          await closeHandle()
          return
        }
        const len = Math.min(STREAM_CHUNK, remaining)
        const buf = new Uint8Array(len)
        const { bytesRead } = await fh.read(buf, 0, len, pos)
        if (bytesRead === 0) {
          controller.close()
          await closeHandle()
          return
        }
        pos += bytesRead
        controller.enqueue(bytesRead === len ? buf : buf.subarray(0, bytesRead))
      } catch (err) {
        // If the handle was closed or cleared during pull (e.g. cancelled), ignore.
        if (!fh) return
        controller.error(err)
        await closeHandle()
      }
    },
    async cancel() {
      cancelled = true
      await closeHandle()
    }
  })
}

/** `captionx-media://file/<encoded-abs-path>` URL에서 로컬 파일 경로를 복원한다. */
export function resolveMediaFilePath(requestUrl: string): string {
  const url = new URL(requestUrl)
  const encoded = url.pathname.replace(/^\/+/, '')
  return Buffer.from(encoded, 'base64url').toString('utf-8')
}

/**
 * `captionx-media://file/<encoded-abs-path>` 요청을 로컬 파일 바이트 범위로 응답한다.
 * Range 헤더를 직접 파싱해, 요청 구간을 pull 기반 스트림(fileRangeStream)으로 206
 * Partial Content로 응답하므로 미디어 seek가 동작하고 재생이 중간에 멈추지 않는다.
 * (net.fetch(file://)는 Range를 무시하고 항상 전체 파일을 200으로 반환해 seek 불가)
 * 반드시 app.whenReady() **이후**에 호출한다.
 */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const filePath = resolveMediaFilePath(request.url)

    // 지원 미디어 확장자만 허용해 임의 파일 접근을 차단한다.
    if (!isMediaPath(filePath)) {
      return new Response('Forbidden', { status: 403 })
    }

    let size: number
    try {
      size = (await stat(filePath)).size
    } catch {
      return new Response('Not Found', { status: 404 })
    }

    const type = mimeFor(filePath)
    const resolved = resolveRange(request.headers.get('Range'), size)

    if (resolved.kind === 'unsatisfiable') {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      })
    }

    if (resolved.kind === 'partial') {
      const { start, end } = resolved
      return new Response(fileRangeStream(filePath, start, end), {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    }

    return new Response(fileRangeStream(filePath, 0, size - 1), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes'
      }
    })
  })
}
