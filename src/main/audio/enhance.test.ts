import { describe, expect, it } from 'vitest'
import { FFT, istft, stft } from './enhance'

describe('FFT', () => {
  it('should perfectly reconstruct a signal after forward and inverse transforms', () => {
    const size = 512
    const fft = new FFT(size)

    const real = new Float32Array(size)
    const imag = new Float32Array(size)

    // Generate a simple test signal (sum of two sine waves)
    for (let i = 0; i < size; i++) {
      real[i] =
        Math.sin((2 * Math.PI * 10 * i) / size) + 0.5 * Math.cos((2 * Math.PI * 25 * i) / size)
      imag[i] = 0
    }

    const originalReal = real.slice()

    // Forward FFT
    fft.transform(real, imag, false)

    // Inverse FFT
    fft.transform(real, imag, true)

    // Verify reconstruction
    for (let i = 0; i < size; i++) {
      expect(real[i]).toBeCloseTo(originalReal[i], 5)
      expect(imag[i]).toBeCloseTo(0, 5)
    }
  })
})

describe('STFT & iSTFT', () => {
  it('should perfectly reconstruct a 1D signal (constant overlap-add property)', () => {
    const pcmLen = 1024
    const pcm = new Float32Array(pcmLen)

    // Generate a deterministic synthetic signal
    for (let i = 0; i < pcmLen; i++) {
      pcm[i] = Math.sin(i * 0.05) * Math.cos(i * 0.01) + 0.05 * Math.sin(i * 0.17)
    }

    // Run STFT
    const { realFlat, imagFlat, numFrames } = stft(pcm, 512, 256)

    // Verify dimensions
    // Number of frames = floor(1024 / 256) + 1 = 4 + 1 = 5
    expect(numFrames).toBe(5)
    expect(realFlat.length).toBe(5 * 257)
    expect(imagFlat.length).toBe(5 * 257)

    // Run iSTFT
    const reconstructed = istft(realFlat, imagFlat, pcmLen, 512, 256)

    // Verify lengths match
    expect(reconstructed.length).toBe(pcmLen)

    // Verify perfect reconstruction (tolerance is small, e.g. < 1e-4)
    // Note: there might be edge fading at the absolute boundaries due to padding,
    // but the inner part should reconstruct perfectly.
    // Let's test the entire range.
    for (let i = 0; i < pcmLen; i++) {
      expect(reconstructed[i]).toBeCloseTo(pcm[i], 4)
    }
  })
})
