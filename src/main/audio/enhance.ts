import { InferenceSession, Tensor } from 'onnxruntime-node'
import { executionProviders } from '../align/wav2vec2'
import { CancellationError } from '../cancellation'

/**
 * Radix-2 Cooley-Tukey Decimation-in-Time FFT
 */
export class FFT {
  private n: number
  private rev: Int32Array
  private cosTable: Float32Array
  private sinTable: Float32Array

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) {
      throw new Error('FFT size must be a power of 2')
    }
    this.n = n
    this.rev = new Int32Array(n)

    const numBits = Math.round(Math.log2(n))
    for (let i = 0; i < n; i++) {
      let j = 0
      for (let k = 0; k < numBits; k++) {
        if ((i & (1 << k)) !== 0) {
          j |= 1 << (numBits - 1 - k)
        }
      }
      this.rev[i] = j
    }

    this.cosTable = new Float32Array(n / 2)
    this.sinTable = new Float32Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      const angle = (2 * Math.PI * i) / n
      this.cosTable[i] = Math.cos(angle)
      this.sinTable[i] = Math.sin(angle)
    }
  }

  public transform(real: Float32Array, imag: Float32Array, inverse = false): void {
    const n = this.n

    // Bit-reversal permutation
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]
      if (i < j) {
        let temp = real[i]
        real[i] = real[j]
        real[j] = temp
        temp = imag[i]
        imag[i] = imag[j]
        imag[j] = temp
      }
    }

    // Cooley-Tukey butterfly stage
    for (let size = 2; size <= n; size <<= 1) {
      const halfSize = size >> 1
      const tabStep = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const k = i + j
          const l = k + halfSize
          const angleIdx = j * tabStep

          const wr = this.cosTable[angleIdx]
          // Conjugate sign depending on direction
          const wi = inverse ? this.sinTable[angleIdx] : -this.sinTable[angleIdx]

          const tr = real[l] * wr - imag[l] * wi
          const ti = real[l] * wi + imag[l] * wr

          real[l] = real[k] - tr
          imag[l] = imag[k] - ti
          real[k] += tr
          imag[k] += ti
        }
      }
    }

    if (inverse) {
      for (let i = 0; i < n; i++) {
        real[i] /= n
        imag[i] /= n
      }
    }
  }
}

// FFT & Window Caching
const fftCache = new Map<number, FFT>()
export function getFFT(size: number): FFT {
  let fft = fftCache.get(size)
  if (!fft) {
    fft = new FFT(size)
    fftCache.set(size, fft)
  }
  return fft
}

const windowCache = new Map<number, Float32Array>()
export function getWindow(size: number): Float32Array {
  let win = windowCache.get(size)
  if (!win) {
    win = new Float32Array(size)
    for (let i = 0; i < size; i++) {
      win[i] = Math.sqrt(0.5 * (1 - Math.cos((2 * Math.PI * i) / size)))
    }
    windowCache.set(size, win)
  }
  return win
}

/**
 * Short-Time Fourier Transform (STFT) matching PyTorch default center=True, WinLength=FFTSize
 * 1차원 Flat Array를 반환하도록 고속화 및 GC를 배제하는 최적화를 하였습니다.
 */
export function stft(
  pcm: Float32Array,
  fftSize = 512,
  hopLength = 256
): { realFlat: Float32Array; imagFlat: Float32Array; numFrames: number } {
  const pad = fftSize / 2
  const pcmLen = pcm.length
  const numFrames = Math.floor(pcmLen / hopLength) + 1
  const numBins = fftSize / 2 + 1

  // Pad on both sides
  const padded = new Float32Array(pcmLen + 2 * pad)
  padded.set(pcm, pad)

  // Window & FFT (Cached)
  const window = getWindow(fftSize)
  const fft = getFFT(fftSize)

  const realFlat = new Float32Array(numFrames * numBins)
  const imagFlat = new Float32Array(numFrames * numBins)

  const fftBufReal = new Float32Array(fftSize)
  const fftBufImag = new Float32Array(fftSize)

  for (let i = 0; i < numFrames; i++) {
    const start = i * hopLength
    for (let n = 0; n < fftSize; n++) {
      fftBufReal[n] = padded[start + n] * window[n]
      fftBufImag[n] = 0
    }

    fft.transform(fftBufReal, fftBufImag, false)

    const offset = i * numBins
    for (let k = 0; k < numBins; k++) {
      realFlat[offset + k] = fftBufReal[k]
      imagFlat[offset + k] = fftBufImag[k]
    }
  }

  return { realFlat, imagFlat, numFrames }
}

/**
 * Inverse Short-Time Fourier Transform (iSTFT) with overlap-add reconstruction
 * Flat TypedArray 입력을 사용해 GC 오버헤드를 극적으로 소멸시켰습니다.
 */
export function istft(
  realFlat: Float32Array,
  imagFlat: Float32Array,
  pcmLen: number,
  fftSize = 512,
  hopLength = 256
): Float32Array {
  const numBins = fftSize / 2 + 1
  const numFrames = Math.floor(realFlat.length / numBins)
  const pad = fftSize / 2
  const paddedOutLen = numFrames * hopLength + pad
  const paddedOut = new Float32Array(paddedOutLen)

  // Window & FFT (Cached)
  const window = getWindow(fftSize)
  const fft = getFFT(fftSize)

  const fftBufReal = new Float32Array(fftSize)
  const fftBufImag = new Float32Array(fftSize)

  for (let i = 0; i < numFrames; i++) {
    const offset = i * numBins

    // Reconstruct full conjugate-symmetric spectrum
    for (let k = 0; k < numBins; k++) {
      fftBufReal[k] = realFlat[offset + k]
      fftBufImag[k] = imagFlat[offset + k]
    }
    for (let k = numBins; k < fftSize; k++) {
      const sym = fftSize - k
      fftBufReal[k] = realFlat[offset + sym]
      fftBufImag[k] = -imagFlat[offset + sym]
    }

    fft.transform(fftBufReal, fftBufImag, true)

    // Overlap-add
    const start = i * hopLength
    for (let n = 0; n < fftSize; n++) {
      paddedOut[start + n] += fftBufReal[n] * window[n]
    }
  }

  // Remove the initial pad and return the original length
  const out = new Float32Array(pcmLen)
  const copyLen = Math.min(pcmLen, paddedOutLen - pad)
  if (copyLen > 0) {
    out.set(paddedOut.subarray(pad, pad + copyLen))
  }
  return out
}

/**
 * Enhance audio PCM using GTCRN ONNX model
 */
/**
 * GTCRN 세션 캐시. `${gpu}:${modelPath}` 키로 1회만 생성해 재사용한다. 정렬 모델
 * (model-loader.ts)과 동일하게 앱 생명주기 동안 유지하므로, 연속·다중 파일 전사에서
 * 호출마다 InferenceSession.create(수백 ms)를 반복하지 않는다. onnxruntime 세션의
 * run()은 동시 호출에 안전하므로 파일 동시성과 무관하게 공유할 수 있다.
 */
const sessionCache = new Map<string, Promise<InferenceSession>>()

function getEnhanceSession(modelPath: string, gpu: boolean): Promise<InferenceSession> {
  const key = `${gpu ? 'gpu' : 'cpu'}:${modelPath}`
  const cached = sessionCache.get(key)
  if (cached) return cached
  // 생성 Promise를 즉시 캐시해 동시 호출이 중복 create 하지 않게 한다(경합 방지).
  const created = InferenceSession.create(modelPath, {
    executionProviders: executionProviders(gpu) as InferenceSession.ExecutionProviderConfig[]
  }).catch((err) => {
    // 생성 실패 시 캐시를 비워 다음 호출이 다시 시도할 수 있게 한다.
    sessionCache.delete(key)
    throw err
  })
  sessionCache.set(key, created)
  return created
}

export async function enhanceAudio(
  pcm: Float32Array,
  modelPath: string,
  gpu: boolean,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<Float32Array> {
  if (signal?.aborted) throw new CancellationError()
  const session = await getEnhanceSession(modelPath, gpu)
  return runEnhance(session, pcm, onProgress, signal)
}

// 오프라인 GTCRN 은 전체 스펙트로그램을 한 번에 처리한다. 다만 매우 긴 오디오에서
// 단일 추론은 메모리가 크고 도중 취소가 불가능하므로, 좌측 컨텍스트(CHUNK_CONTEXT)를
// 덧붙인 청크 단위로 추론한다. 컨텍스트로 GRU 상태를 예열해 청크 경계 불연속을 없앤다.
const CHUNK_FRAMES = 2000
const CHUNK_CONTEXT = 100

async function runEnhance(
  session: InferenceSession,
  pcm: Float32Array,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<Float32Array> {
  // 1. STFT
  const { realFlat, imagFlat, numFrames } = stft(pcm, 512, 256)

  const numBins = 257 // fftSize / 2 + 1
  const enhancedRealFlat = new Float32Array(numFrames * numBins)
  const enhancedImagFlat = new Float32Array(numFrames * numBins)

  // 2. 청크 단위 오프라인 추론
  for (let start = 0; start < numFrames; start += CHUNK_FRAMES) {
    if (signal?.aborted) throw new CancellationError()

    const ctxStart = Math.max(0, start - CHUNK_CONTEXT)
    const end = Math.min(numFrames, start + CHUNK_FRAMES)
    const segLen = end - ctxStart

    // mix 텐서 [1, 257, segLen, 2] (row-major: (k*segLen + t)*2 + c)
    const mixBuf = new Float32Array(257 * segLen * 2)
    for (let t = 0; t < segLen; t++) {
      const offset = (ctxStart + t) * numBins
      for (let k = 0; k < 257; k++) {
        const idx = (k * segLen + t) * 2
        mixBuf[idx] = realFlat[offset + k]
        mixBuf[idx + 1] = imagFlat[offset + k]
      }
    }
    const mixTensor = new Tensor('float32', mixBuf, [1, 257, segLen, 2])

    const results = await session.run({ mix: mixTensor })
    const enhData = results.enh.data as Float32Array

    // 컨텍스트 구간은 버리고 [start, end) 만 취한다.
    const offset = start - ctxStart
    for (let t = offset; t < segLen; t++) {
      const frame = ctxStart + t
      const outOffset = frame * numBins
      for (let k = 0; k < 257; k++) {
        const idx = (k * segLen + t) * 2
        enhancedRealFlat[outOffset + k] = enhData[idx]
        enhancedImagFlat[outOffset + k] = enhData[idx + 1]
      }
    }

    if (onProgress) {
      onProgress(Math.round((end / numFrames) * 100))
    }
  }

  if (onProgress) {
    onProgress(100)
  }

  // 3. iSTFT
  return istft(enhancedRealFlat, enhancedImagFlat, pcm.length, 512, 256)
}
