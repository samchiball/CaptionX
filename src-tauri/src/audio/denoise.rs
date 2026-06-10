//! GTCRN-based speech enhancement (noise/background suppression) preprocessing.
//!
//! Pipeline: 16kHz mono PCM → STFT → GTCRN streaming ONNX (frame-by-frame) → ISTFT → PCM.
//!
//! STFT parameters exactly match the GTCRN reference implementation (Xiaobin-Rong/gtcrn `infer.py`):
//! `torch.stft(x, n_fft=512, hop_length=256, win_length=512,
//!             window=hann_window(512).pow(0.5), center=True)`.
//!
//! DSP (STFT/ISTFT) is decoupled to allow unit testing without `full` feature,
//! and only ONNX inference (`denoise_pcm`) is gated under the `full` feature.

use realfft::RealFftPlanner;

pub const N_FFT: usize = 512;
pub const HOP: usize = 256;
pub const N_BINS: usize = N_FFT / 2 + 1; // 257
const PAD: usize = N_FFT / 2; // center=True 패딩량 (256)

/// GTCRN Spectrogram: frame-major storage. `frames[i][bin] = [re, im]`.
pub struct Spectrogram {
    pub n_frames: usize,
    pub frames: Vec<Vec<[f32; 2]>>,
}

/// `sqrt(hann_window(512, periodic=True))` — identical to torch.hann_window(N).pow(0.5).
/// periodic=True, so the denominator is N (=512) (not N-1).
fn sqrt_hann_window() -> [f32; N_FFT] {
    let mut w = [0.0f32; N_FFT];
    for (k, slot) in w.iter_mut().enumerate() {
        let h = 0.5 - 0.5 * (2.0 * std::f64::consts::PI * k as f64 / N_FFT as f64).cos();
        *slot = h.sqrt() as f32;
    }
    w
}

/// Reflect padding identical to numpy `np.pad(x, pad, mode='reflect')`.
/// Reflects edge samples without duplication: [1,2,3,4], pad=2 → [3,2,1,2,3,4,3,2].
/// Gards against panics by clamping reflection indices if the signal is too short (`n <= pad`).
fn reflect_pad(x: &[f32], pad: usize) -> Vec<f32> {
    let n = x.len();
    let mut out = Vec::with_capacity(n + 2 * pad);
    for i in 0..pad {
        // i=0 → x[pad], i=pad-1 → x[1]
        let idx = pad.saturating_sub(i);
        out.push(x[idx.min(n - 1)]);
    }
    out.extend_from_slice(x);
    for i in 0..pad {
        // i=0 → x[n-2], i=pad-1 → x[n-1-pad]
        let idx = (n as isize - 2 - i as isize).max(0) as usize;
        out.push(x[idx.min(n - 1)]);
    }
    out
}

/// Frame count: identical to `1 + n/hop` (integer division) for torch.stft center=True.
pub fn num_frames(signal_len: usize) -> usize {
    if signal_len == 0 {
        return 0;
    }
    1 + signal_len / HOP
}

/// 16kHz mono PCM → complex STFT spectrogram.
pub fn stft(signal: &[f32]) -> Spectrogram {
    if signal.len() <= PAD {
        return Spectrogram {
            n_frames: 0,
            frames: Vec::new(),
        };
    }
    let window = sqrt_hann_window();
    let padded = reflect_pad(signal, PAD);
    let n_frames = 1 + (padded.len() - N_FFT) / HOP;

    let mut planner = RealFftPlanner::<f32>::new();
    let r2c = planner.plan_fft_forward(N_FFT);
    let mut scratch = r2c.make_input_vec();
    let mut spectrum = r2c.make_output_vec();

    let mut frames = Vec::with_capacity(n_frames);
    for i in 0..n_frames {
        let off = i * HOP;
        for j in 0..N_FFT {
            scratch[j] = padded[off + j] * window[j];
        }
        r2c.process(&mut scratch, &mut spectrum).expect("rfft");
        let frame: Vec<[f32; 2]> = spectrum.iter().map(|c| [c.re, c.im]).collect();
        frames.push(frame);
    }

    Spectrogram { n_frames, frames }
}

/// Complex STFT spectrogram → 16kHz mono PCM (ISTFT, square-window normalization + padding removal).
pub fn istft(spec: &Spectrogram, out_len: usize) -> Vec<f32> {
    if spec.n_frames == 0 || out_len == 0 {
        return vec![0.0; out_len];
    }
    let window = sqrt_hann_window();
    let padded_len = (spec.n_frames - 1) * HOP + N_FFT;

    let mut planner = RealFftPlanner::<f32>::new();
    let c2r = planner.plan_fft_inverse(N_FFT);
    let mut spectrum = c2r.make_input_vec();
    let mut time = c2r.make_output_vec();

    let mut acc = vec![0.0f32; padded_len];
    let mut env = vec![0.0f32; padded_len];

    let last = spectrum.len() - 1; // Nyquist bin (256)
    for (i, frame) in spec.frames.iter().enumerate() {
        for (b, slot) in spectrum.iter_mut().enumerate() {
            let v = frame.get(b).copied().unwrap_or([0.0, 0.0]);
            *slot = realfft::num_complex::Complex::new(v[0], v[1]);
        }
        // realfft's c2r requires DC and Nyquist imaginary parts to be 0 (otherwise process returns Err).
        // GTCRN output doesn't guarantee this, so discard imaginary parts like numpy.irfft.
        spectrum[0].im = 0.0;
        spectrum[last].im = 0.0;
        // realfft's c2r does not normalize, so we manually divide by 1/N (compatible with numpy irfft).
        c2r.process(&mut spectrum, &mut time).expect("irfft");
        let off = i * HOP;
        for j in 0..N_FFT {
            let s = time[j] / N_FFT as f32 * window[j];
            acc[off + j] += s;
            env[off + j] += window[j] * window[j];
        }
    }

    // Normalize with square-window envelope (same as torch.istft)
    #[allow(clippy::needless_range_loop)]
    for k in 0..padded_len {
        if env[k] > 1e-8 {
            acc[k] /= env[k];
        }
    }

    // Remove center padding and return up to out_len
    let mut out = vec![0.0f32; out_len];
    #[allow(clippy::needless_range_loop)]
    for k in 0..out_len {
        let idx = k + PAD;
        if idx < acc.len() {
            out[k] = acc[idx];
        }
    }
    out
}

// ─── GTCRN ONNX Inference (Requires full feature) ─────────────────────────────

/// Applies GTCRN speech enhancement to the PCM.
///
/// If the model file is missing, returns the original PCM (graceful degradation).
#[cfg(not(feature = "full"))]
pub fn denoise_pcm(pcm: Vec<f32>, _model_path: &std::path::Path) -> anyhow::Result<Vec<f32>> {
    Ok(pcm)
}

#[cfg(feature = "full")]
pub fn denoise_pcm(pcm: Vec<f32>, model_path: &std::path::Path) -> anyhow::Result<Vec<f32>> {
    if !model_path.exists() || pcm.len() <= PAD {
        return Ok(pcm);
    }

    let spec = stft(&pcm);
    if spec.n_frames == 0 {
        return Ok(pcm);
    }

    let enh = denoise_spectrogram(&spec, model_path)?;
    Ok(istft(&enh, pcm.len()))
}

/// Applies GTCRN streaming ONNX frame-by-frame on the spectrogram.
///
/// Zero-initializes cache state tensors (conv/tra/inter), then passes the output cache of each frame
/// to the next frame. Returns the enhanced complex spectrogram.
#[cfg(feature = "full")]
pub fn denoise_spectrogram(
    spec: &Spectrogram,
    model_path: &std::path::Path,
) -> anyhow::Result<Spectrogram> {
    use anyhow::Context;
    use ort::value::Tensor;

    #[allow(clippy::needless_question_mark)]
    let mut session = ort::session::Session::builder()
        .and_then(|b| Ok(b.with_intra_threads(1)?))
        .and_then(|mut b| Ok(b.commit_from_file(model_path)?))
        .map_err(|e| anyhow::anyhow!("Failed to load GTCRN ONNX: {e}"))?;

    // Cache state tensors (zero-init). Pass output cache to the next frame.
    let mut conv_cache = vec![0.0f32; 2 * 16 * 16 * 33];
    let mut tra_cache = vec![0.0f32; 2 * 3 * 16];
    let mut inter_cache = vec![0.0f32; 2 * 33 * 16];

    let mut enh = Spectrogram {
        n_frames: spec.n_frames,
        frames: Vec::with_capacity(spec.n_frames),
    };

    for frame in &spec.frames {
        // mix: [1, 257, 1, 2]
        let mut mix = vec![0.0f32; N_BINS * 2];
        for (b, v) in frame.iter().enumerate() {
            mix[b * 2] = v[0];
            mix[b * 2 + 1] = v[1];
        }
        let mix_t = Tensor::<f32>::from_array(([1, N_BINS, 1, 2], mix.into_boxed_slice()))?;
        let conv_t =
            Tensor::<f32>::from_array(([2, 1, 16, 16, 33], conv_cache.clone().into_boxed_slice()))?;
        let tra_t =
            Tensor::<f32>::from_array(([2, 3, 1, 1, 16], tra_cache.clone().into_boxed_slice()))?;
        let inter_t =
            Tensor::<f32>::from_array(([2, 1, 33, 16], inter_cache.clone().into_boxed_slice()))?;

        let outputs = session
            .run(ort::inputs![
                "mix" => mix_t,
                "conv_cache" => conv_t,
                "tra_cache" => tra_t,
                "inter_cache" => inter_t,
            ])
            .context("Failed GTCRN frame inference")?;

        let (_, enh_flat) = outputs
            .get("enh")
            .context("No enh output")?
            .try_extract_tensor::<f32>()?;
        let mut frame_out = Vec::with_capacity(N_BINS);
        for b in 0..N_BINS {
            frame_out.push([enh_flat[b * 2], enh_flat[b * 2 + 1]]);
        }
        enh.frames.push(frame_out);

        // Update cache (pass output cache as input to the next frame)
        conv_cache = outputs
            .get("conv_cache_out")
            .context("No conv_cache_out")?
            .try_extract_tensor::<f32>()?
            .1
            .to_vec();
        tra_cache = outputs
            .get("tra_cache_out")
            .context("No tra_cache_out")?
            .try_extract_tensor::<f32>()?
            .1
            .to_vec();
        inter_cache = outputs
            .get("inter_cache_out")
            .context("No inter_cache_out")?
            .try_extract_tensor::<f32>()?
            .1
            .to_vec();
    }

    Ok(enh)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_oracle() -> serde_json::Value {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/gtcrn_oracle.json");
        let data = std::fs::read_to_string(path).expect("failed to read oracle fixture");
        serde_json::from_str(&data).expect("failed to parse oracle JSON")
    }

    /// sqrt-hann window must match torch.hann_window(512).pow(0.5).
    #[test]
    fn window_matches_oracle() {
        let oracle = load_oracle();
        let expected = oracle["window_first8"].as_array().unwrap();
        let w = sqrt_hann_window();
        for (i, e) in expected.iter().enumerate() {
            let exp = e.as_f64().unwrap() as f32;
            assert!(
                (w[i] - exp).abs() < 1e-5,
                "window[{i}] = {} != {exp}",
                w[i]
            );
        }
    }

    /// reflect padding must match numpy mode='reflect'.
    #[test]
    fn reflect_pad_matches_numpy() {
        let x = [1.0f32, 2.0, 3.0, 4.0];
        let p = reflect_pad(&x, 2);
        assert_eq!(p, vec![3.0, 2.0, 1.0, 2.0, 3.0, 4.0, 3.0, 2.0]);
    }

    /// Frame count must match oracle (1s = 63 frames).
    #[test]
    fn num_frames_matches_oracle() {
        let oracle = load_oracle();
        let n = oracle["signal"].as_array().unwrap().len();
        let expected = oracle["n_frames"].as_u64().unwrap() as usize;
        assert_eq!(num_frames(n), expected, "frame count = 1 + n/hop");
    }

    /// STFT must numerically match torch.stft oracle (frame0, frame1 first 6 bins).
    /// Key to prevent false-green: window/padding/FFT must all be correct to pass.
    #[test]
    fn stft_matches_oracle() {
        let oracle = load_oracle();
        let signal: Vec<f32> = oracle["signal"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap() as f32)
            .collect();
        let spec = stft(&signal);

        for (frame_key, frame_idx) in [("stft_frame0_first6", 0), ("stft_frame1_first6", 1)] {
            let expected = oracle[frame_key].as_array().unwrap();
            for (b, pair) in expected.iter().enumerate() {
                let re = pair[0].as_f64().unwrap() as f32;
                let im = pair[1].as_f64().unwrap() as f32;
                let got = spec.frames[frame_idx][b];
                assert!(
                    (got[0] - re).abs() < 1e-2,
                    "{frame_key} bin{b} re: {} != {re}",
                    got[0]
                );
                assert!(
                    (got[1] - im).abs() < 1e-2,
                    "{frame_key} bin{b} im: {} != {im}",
                    got[1]
                );
            }
        }
    }

    /// STFT->ISTFT roundtrip must reconstruct original (COLA reconstruction, internal error < 1e-3).
    #[test]
    fn istft_roundtrip_reconstructs_signal() {
        // Deterministic signal
        let n = 8000;
        let signal: Vec<f32> = (0..n)
            .map(|i| 0.3 * (2.0 * std::f32::consts::PI * 220.0 * i as f32 / 16000.0).sin())
            .collect();
        let spec = stft(&signal);
        let recon = istft(&spec, n);

        // Compare internal range excluding edges (padding effect)
        let mut max_err = 0.0f32;
        for i in 512..(n - 512) {
            max_err = max_err.max((recon[i] - signal[i]).abs());
        }
        assert!(max_err < 1e-3, "roundtrip reconstruction max error {max_err} >= 1e-3");
    }

    /// Empty or short signals should be handled without panic.
    #[test]
    fn stft_handles_short_signal_without_panic() {
        assert_eq!(stft(&[]).n_frames, 0);
        assert_eq!(stft(&[0.1, 0.2, 0.3]).n_frames, 0); // <= PAD
    }

    /// denoise_pcm returns PCM as-is in non-full build (no-op fallback).
    #[cfg(not(feature = "full"))]
    #[test]
    fn denoise_pcm_noop_without_full() {
        let pcm = vec![0.1f32, 0.2, 0.3];
        let out = denoise_pcm(pcm.clone(), std::path::Path::new("/nonexistent")).unwrap();
        assert_eq!(out, pcm);
    }

    /// full build: GTCRN frame-by-frame inference must numerically match
    /// Python onnxruntime oracle (frame0/frame5 first 6 bins). Cache passing and tensor layout
    /// must be correct to pass — prevents false-green that cannot be caught by structural tests.
    /// Skip if model is absent.
    #[cfg(feature = "full")]
    #[test]
    fn gtcrn_frame_matches_onnx_oracle() {
        let model = {
            let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
            std::path::PathBuf::from(appdata)
                .join("CaptionX")
                .join("models")
                .join("gtcrn_simple.onnx")
        };
        if !model.exists() {
            return; // Skip if model is absent
        }

        let oracle = load_oracle();
        let signal: Vec<f32> = oracle["signal"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap() as f32)
            .collect();

        let spec = stft(&signal);
        let enh = denoise_spectrogram(&spec, &model).expect("denoise_spectrogram");

        for (key, frame_idx) in [("enh_frame0_first6", 0usize), ("enh_frame5_first6", 5)] {
            let expected = oracle[key].as_array().unwrap();
            for (b, pair) in expected.iter().enumerate() {
                let re = pair[0].as_f64().unwrap() as f32;
                let im = pair[1].as_f64().unwrap() as f32;
                let got = enh.frames[frame_idx][b];
                assert!(
                    (got[0] - re).abs() < 1e-3,
                    "{key} bin{b} re: {} != {re}",
                    got[0]
                );
                assert!(
                    (got[1] - im).abs() < 1e-3,
                    "{key} bin{b} im: {} != {im}",
                    got[1]
                );
            }
        }
    }

    /// full build: execute full pipeline entrypoint `denoise_pcm` (stft -> inference -> istft).
    /// Since component tests do not cover synthesis (length guard, istft out_len), verify here.
    /// Skip if model is absent.
    #[cfg(feature = "full")]
    #[test]
    fn denoise_pcm_full_pipeline_preserves_length_and_finite() {
        let model = {
            let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
            std::path::PathBuf::from(appdata)
                .join("CaptionX")
                .join("models")
                .join("gtcrn_simple.onnx")
        };
        if !model.exists() {
            return;
        }

        let oracle = load_oracle();
        let signal: Vec<f32> = oracle["signal"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap() as f32)
            .collect();

        let out = denoise_pcm(signal.clone(), &model).expect("denoise_pcm");

        // Preserve length
        assert_eq!(out.len(), signal.len(), "denoise output length = input length");
        // All values finite
        assert!(out.iter().all(|x| x.is_finite()), "must not have NaN/Inf");
        // Normal energy: non-zero and not exploding (0.1x to 3.0x input RMS)
        let rms = |s: &[f32]| (s.iter().map(|x| x * x).sum::<f32>() / s.len() as f32).sqrt();
        let (rin, rout) = (rms(&signal), rms(&out));
        assert!(rout > 1e-4, "output collapsed to silence: rms={rout}");
        assert!(
            rout < rin * 3.0,
            "output energy exploded: in={rin} out={rout}"
        );
    }
}
