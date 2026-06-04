import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileRangeStream, mimeFor, readSlice, resolveRange } from './media-protocol'

/** ReadableStream을 모두 소비해 하나의 Uint8Array로 합친다. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

describe('resolveRange', () => {
  const size = 1000

  it('Range 헤더가 없으면 전체(full)', () => {
    expect(resolveRange(null, size)).toEqual({ kind: 'full' })
  })

  it('형식이 맞지 않으면 전체(full)', () => {
    expect(resolveRange('bytes=abc', size)).toEqual({ kind: 'full' })
    expect(resolveRange('items=0-10', size)).toEqual({ kind: 'full' })
  })

  it('열린 끝(bytes=0-)은 마지막 바이트까지', () => {
    expect(resolveRange('bytes=0-', size)).toEqual({ kind: 'partial', start: 0, end: 999 })
  })

  it('중간 구간 seek (bytes=500-)', () => {
    expect(resolveRange('bytes=500-', size)).toEqual({ kind: 'partial', start: 500, end: 999 })
  })

  it('닫힌 구간 (bytes=100-199)', () => {
    expect(resolveRange('bytes=100-199', size)).toEqual({ kind: 'partial', start: 100, end: 199 })
  })

  it('end가 크기를 넘으면 size-1로 클램프', () => {
    expect(resolveRange('bytes=900-9999', size)).toEqual({ kind: 'partial', start: 900, end: 999 })
  })

  it('공백이 섞여도 파싱', () => {
    expect(resolveRange(' bytes=0-99 ', size)).toEqual({ kind: 'partial', start: 0, end: 99 })
  })

  it('start가 파일 크기 이상이면 unsatisfiable', () => {
    expect(resolveRange('bytes=1000-', size)).toEqual({ kind: 'unsatisfiable' })
    expect(resolveRange('bytes=2000-3000', size)).toEqual({ kind: 'unsatisfiable' })
  })

  it('start > end이면 unsatisfiable', () => {
    expect(resolveRange('bytes=500-400', size)).toEqual({ kind: 'unsatisfiable' })
  })
})

describe('mimeFor', () => {
  it('확장자에 맞는 MIME', () => {
    expect(mimeFor('a/b/c.m4a')).toBe('audio/mp4')
    expect(mimeFor('clip.MP4')).toBe('video/mp4')
    expect(mimeFor('song.mp3')).toBe('audio/mpeg')
  })

  it('알 수 없는 확장자는 octet-stream', () => {
    expect(mimeFor('file.xyz')).toBe('application/octet-stream')
    expect(mimeFor('noext')).toBe('application/octet-stream')
  })
})

describe('readSlice', () => {
  let dir: string
  let filePath: string
  // 단일 read가 부분만 읽는 상황까지 견디도록 충분히 큰 파일(2MB).
  const total = 2 * 1024 * 1024
  let data: Uint8Array

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'captionx-media-'))
    filePath = join(dir, 'sample.bin')
    data = new Uint8Array(total)
    for (let i = 0; i < total; i++) data[i] = i & 0xff
    await writeFile(filePath, data)
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('전체 범위를 한 바이트도 빠짐없이 읽는다', async () => {
    const buf = new Uint8Array(await readSlice(filePath, 0, total - 1))
    expect(buf.byteLength).toBe(total)
    expect(buf[0]).toBe(data[0])
    expect(buf[total - 1]).toBe(data[total - 1])
    expect(Buffer.from(buf).equals(Buffer.from(data))).toBe(true)
  })

  it('중간 구간을 정확히 읽는다', async () => {
    const start = 1_000_000
    const end = 1_500_000
    const buf = new Uint8Array(await readSlice(filePath, start, end))
    expect(buf.byteLength).toBe(end - start + 1)
    expect(buf[0]).toBe(data[start])
    expect(buf[buf.byteLength - 1]).toBe(data[end])
  })

  it('파일 끝을 넘어가지 않는 마지막 구간', async () => {
    const start = total - 10
    const end = total - 1
    const buf = new Uint8Array(await readSlice(filePath, start, end))
    expect(buf.byteLength).toBe(10)
    expect(buf[9]).toBe(data[total - 1])
  })

  describe('fileRangeStream', () => {
    it('전체 구간을 청크로 나눠 빠짐없이 스트리밍한다', async () => {
      const buf = await drain(fileRangeStream(filePath, 0, total - 1))
      expect(buf.byteLength).toBe(total)
      expect(Buffer.from(buf).equals(Buffer.from(data))).toBe(true)
    })

    it('중간 구간(양끝 포함)만 정확히 스트리밍한다', async () => {
      const start = 1_000_000
      const end = 1_500_000
      const buf = await drain(fileRangeStream(filePath, start, end))
      expect(buf.byteLength).toBe(end - start + 1)
      expect(buf[0]).toBe(data[start])
      expect(buf[buf.byteLength - 1]).toBe(data[end])
    })

    it('단일 청크보다 작은 구간도 한 청크로 처리한다', async () => {
      const buf = await drain(fileRangeStream(filePath, 5, 9))
      expect(Array.from(buf)).toEqual([5, 6, 7, 8, 9])
    })
  })
})
