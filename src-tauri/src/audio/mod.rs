pub mod decode;
pub mod denoise;

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_audio_streams ──────────────────────────────────────────────────

    #[test]
    fn empty_stderr_returns_no_tracks() {
        assert!(parse_audio_streams("").is_empty());
    }

    #[test]
    fn video_only_file_no_audio_streams() {
        let stderr = "Input #0, matroska,webm, from 'test.mkv':\n  Stream #0:0: Video: h264\n";
        assert!(parse_audio_streams(stderr).is_empty());
    }

    #[test]
    fn single_stereo_aac_track() {
        let stderr = "  Stream #0:1(und): Audio: aac, 44100 Hz, stereo, fltp, 128 kb/s\n";
        let tracks = parse_audio_streams(stderr);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].codec, "aac");
        assert_eq!(tracks[0].channels, 2);
        assert_eq!(tracks[0].language, Some("und".to_string()));
        assert_eq!(tracks[0].index, 0);
    }

    #[test]
    fn multi_track_indexed_correctly() {
        let stderr = concat!(
            "  Stream #0:1(eng): Audio: aac, 48000 Hz, stereo, fltp\n",
            "  Stream #0:2(jpn): Audio: aac, 48000 Hz, stereo, fltp\n",
            "  Stream #0:3(kor): Audio: ac3, 48000 Hz, 5.1, fltp\n",
        );
        let tracks = parse_audio_streams(stderr);
        assert_eq!(tracks.len(), 3);
        assert_eq!(tracks[0].index, 0);
        assert_eq!(tracks[1].index, 1);
        assert_eq!(tracks[2].index, 2);
        assert_eq!(tracks[0].language, Some("eng".to_string()));
        assert_eq!(tracks[1].language, Some("jpn".to_string()));
        assert_eq!(tracks[2].channels, 6); // 5.1 = 6ch
    }

    #[test]
    fn mono_stream_one_channel() {
        let stderr = "  Stream #0:0: Audio: mp3, 44100 Hz, mono, s16p\n";
        let tracks = parse_audio_streams(stderr);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].channels, 1);
    }

    #[test]
    fn surround_51_six_channels() {
        let stderr = "  Stream #0:0: Audio: ac3, 48000 Hz, 5.1(side), fltp\n";
        let tracks = parse_audio_streams(stderr);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].channels, 6);
    }

    #[test]
    fn stream_without_language_tag() {
        let stderr = "  Stream #0:0: Audio: pcm_s16le, 48000 Hz, stereo\n";
        let tracks = parse_audio_streams(stderr);
        assert_eq!(tracks.len(), 1);
        assert!(tracks[0].language.is_none(), "언어 태그 없으면 None");
    }

    #[test]
    fn malformed_line_ignored() {
        let stderr = "  Not a stream line: Audio: aac\n  Stream #garbage: Audio: aac\n";
        // "Stream #garbage"는 Audio: 포함하고 Stream # 포함하므로 파싱 시도될 수 있음
        // 중요한 것: 패닉 없이 실행되는 것
        let _ = parse_audio_streams(stderr);
    }

    #[test]
    fn n_channel_count_fallback() {
        let stderr = "  Stream #0:0: Audio: flac, 44100 Hz, 7.1, s32\n";
        let tracks = parse_audio_streams(stderr);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].channels, 8); // 7.1 = 8ch
    }

    #[test]
    fn title_metadata_extracted() {
        let stderr = concat!(
            "  Stream #0:1(eng): Audio: aac, stereo\n",
            "    Metadata:\n",
            "      title           : Director's Commentary\n",
        );
        let tracks = parse_audio_streams(stderr);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, Some("Director's Commentary".to_string()));
    }

    // ── unique_temp_name ─────────────────────────────────────────────────────
    // 동시 prepare_media 호출(StrictMode 이중 발사 등)이 같은 캐시 키로 같은
    // 임시 파일에 동시 기록하면 바이트가 뒤섞여 디코드 불가 m4a가 생긴다.
    // 임시 경로는 호출마다 고유해야 한다.

    #[test]
    fn unique_temp_name_differs_across_calls() {
        let a = unique_temp_name("deadbeef");
        let b = unique_temp_name("deadbeef");
        assert_ne!(a, b, "동시 기록자는 임시 경로를 공유하면 안 된다");
    }

    #[test]
    fn unique_temp_name_keeps_base_and_part_suffix() {
        let name = unique_temp_name("deadbeef");
        assert!(name.contains("deadbeef"), "base 해시를 유지해야 한다: {name}");
        assert!(name.ends_with(".part"), ".part 확장자를 유지해야 한다: {name}");
    }
}

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result};

use crate::types::AudioTrack;

/// ffmpeg-sidecar가 관리하는 번들 ffmpeg 경로
fn ffmpeg_bin() -> PathBuf {
    ffmpeg_sidecar::paths::ffmpeg_path()
}

// ─── probe_tracks ────────────────────────────────────────────────────────────

/// ffmpeg -i stderr에서 오디오 트랙 목록을 파싱한다 (LEGACY/src/main/audio/tracks.ts 이식)
pub fn parse_audio_streams(stderr: &str) -> Vec<AudioTrack> {
    let mut tracks: Vec<AudioTrack> = Vec::new();
    let mut audio_index: u32 = 0;

    let channel_map: &[(&str, u32)] = &[
        ("mono", 1),
        ("stereo", 2),
        ("downmix", 2),
        ("2.1", 3),
        ("quad", 4),
        ("4.0", 4),
        ("5.0", 5),
        ("5.1(side)", 6),
        ("5.1", 6),
        ("6.1", 7),
        ("7.1", 8),
    ];

    let lines: Vec<&str> = stderr.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        // Stream #0:N[(lang)]: Audio: <codec>
        let Some(audio_pos) = line.find("Audio:") else {
            continue;
        };
        if !line.contains("Stream #") {
            continue;
        }

        let lang = regex_simple_lang(line);
        let codec = line[audio_pos + 6..]
            .trim()
            .split([',', ' ', '('])
            .next()
            .unwrap_or("")
            .to_string();

        let mut channels: u32 = 0;
        for &(token, count) in channel_map {
            if line.contains(&format!(", {token}")) || line.contains(&format!(", {token},")) {
                channels = count;
                break;
            }
        }
        if channels == 0 {
            if let Some(cap) = extract_channel_count(line) {
                channels = cap;
            }
        }

        // 다음 줄에서 title 메타데이터 탐색
        let mut title: Option<String> = None;
        for next in lines.iter().skip(i + 1) {
            if next.contains("Stream #") {
                break;
            }
            if let Some(t) = extract_title(next) {
                title = Some(t);
                break;
            }
            if !next.starts_with(' ') && !next.trim().is_empty() {
                break;
            }
        }

        tracks.push(AudioTrack {
            index: audio_index,
            codec,
            channels,
            language: lang,
            title,
        });
        audio_index += 1;
    }
    tracks
}

fn regex_simple_lang(line: &str) -> Option<String> {
    // Stream #0:1(eng): Audio:  →  "eng"
    let start = line.find('(')?;
    let end = line[start..].find(')')?;
    let lang = &line[start + 1..start + end];
    if lang.chars().all(|c| c.is_ascii_alphabetic()) && lang.len() <= 4 {
        Some(lang.to_string())
    } else {
        None
    }
}

fn extract_channel_count(line: &str) -> Option<u32> {
    // ", N channels"
    let idx = line.find(" channels")?;
    let before = &line[..idx];
    let num_start = before.rfind(|c: char| !c.is_ascii_digit() && c != ' ')? + 1;
    before[num_start..].trim().parse().ok()
}

fn extract_title(line: &str) -> Option<String> {
    let lower = line.to_lowercase();
    let idx = lower.find("title")?;
    let after = &line[idx + 5..];
    let colon = after.find(':')?;
    Some(after[colon + 1..].trim().to_string())
}

/// 입력 미디어의 오디오 트랙 목록을 ffmpeg로 조사한다
pub fn probe_audio_tracks(file_path: &str) -> Result<Vec<AudioTrack>> {
    let output = Command::new(ffmpeg_bin())
        .args(["-hide_banner", "-i", file_path])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .context("ffmpeg 실행 실패")?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(parse_audio_streams(&stderr))
}

// ─── prepare_media ────────────────────────────────────────────────────────────

/// 호환 코덱 → 리먹스 출력 포맷
struct CopyTarget {
    ext: &'static str,
    format: &'static str,
    faststart: bool,
}

fn copyable(codec: &str) -> Option<CopyTarget> {
    match codec {
        "aac" => Some(CopyTarget {
            ext: "m4a",
            format: "mp4",
            faststart: true,
        }),
        "mp3" => Some(CopyTarget {
            ext: "mp3",
            format: "mp3",
            faststart: false,
        }),
        "flac" => Some(CopyTarget {
            ext: "flac",
            format: "flac",
            faststart: false,
        }),
        "opus" => Some(CopyTarget {
            ext: "opus",
            format: "ogg",
            faststart: false,
        }),
        "vorbis" => Some(CopyTarget {
            ext: "ogg",
            format: "ogg",
            faststart: false,
        }),
        _ => None,
    }
}

/// 추출 캐시 스키마 버전. 손상 파일(과거 동시 기록 경합으로 깨진 m4a)을 만든
/// 이전 빌드의 캐시를 영구히 무효화하기 위해 캐시 키에 섞는다. 쓰기 로직이
/// 깨진 파일을 만들 수 있게 바뀌면 이 값을 올린다.
const CACHE_VERSION: u32 = 2;

fn cache_key(file_path: &str, size: u64, mtime_ms: u128, track_index: Option<u32>) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut h = DefaultHasher::new();
    CACHE_VERSION.hash(&mut h);
    file_path.hash(&mut h);
    size.hash(&mut h);
    mtime_ms.hash(&mut h);
    track_index.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// 호출마다 고유한 임시 파일명을 만든다. 같은 캐시 키로 동시 추출이 일어나도
/// (예: React StrictMode가 effect를 이중 발사해 prepare_media가 두 번 호출됨)
/// 서로의 임시 파일을 덮어쓰지 않아, 바이트가 뒤섞인 디코드 불가 m4a를 막는다.
fn unique_temp_name(base: &str) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let pid = std::process::id();
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(".{base}.{pid}.{seq}.{nanos}.part")
}

/// 오디오 트랙을 브라우저 호환 포맷으로 추출하고 경로를 반환한다
pub fn prepare_media_audio(
    file_path: &str,
    track_index: Option<u32>,
    cache_dir: &Path,
) -> Result<String> {
    std::fs::create_dir_all(cache_dir)?;

    let meta = std::fs::metadata(file_path)?;
    let size = meta.len();
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    // 트랙 코덱 조회
    let tracks = probe_audio_tracks(file_path).unwrap_or_default();
    let codec = tracks
        .get(track_index.unwrap_or(0) as usize)
        .map(|t| t.codec.as_str());
    let ti = track_index.unwrap_or(0);

    let (ext, args): (&str, Vec<String>) = if let Some(ct) = codec.and_then(copyable) {
        let mut a = vec![
            "-map".into(),
            format!("0:a:{ti}"),
            "-vn".into(),
            "-sn".into(),
            "-dn".into(),
            "-c:a".into(),
            "copy".into(),
        ];
        if ct.faststart {
            a.extend(["-movflags".into(), "+faststart".into()]);
        }
        a.extend(["-f".into(), ct.format.into()]);
        (ct.ext, a)
    } else {
        let a = vec![
            "-map".into(),
            format!("0:a:{ti}"),
            "-vn".into(),
            "-sn".into(),
            "-dn".into(),
            "-c:a".into(),
            "aac".into(),
            "-b:a".into(),
            "160k".into(),
            "-movflags".into(),
            "+faststart".into(),
            "-f".into(),
            "mp4".into(),
        ];
        ("m4a", a)
    };

    let base = cache_key(file_path, size, mtime_ms, track_index);
    let out = cache_dir.join(format!("{base}.{ext}"));
    if out.exists() {
        return Ok(out.to_string_lossy().into_owned());
    }

    let tmp = cache_dir.join(unique_temp_name(&base));
    let mut cmd_args = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-i".into(),
        file_path.to_string(),
    ];
    cmd_args.extend(args);
    cmd_args.push(tmp.to_string_lossy().into_owned());

    let status = Command::new(ffmpeg_bin())
        .args(&cmd_args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .context("ffmpeg 오디오 추출 실패")?;

    if status.success() {
        // 동시 추출이 우리보다 먼저 out을 완성했을 수 있다. 그렇다면 우리 임시
        // 파일은 버린다(이미 WebView가 열었을 수 있는 파일을 교체하지 않는다).
        // 각 기록자는 독립된 완전한 파일을 만들고 rename은 원자적이라 바이트가
        // 뒤섞이지 않는다.
        if out.exists() {
            let _ = std::fs::remove_file(&tmp);
        } else if let Err(e) = std::fs::rename(&tmp, &out) {
            // Windows에서는 그 찰나에 다른 기록자가 out을 만들면 rename이 실패한다.
            // out이 이미 있으면 경합에서 졌을 뿐이므로 성공으로 처리한다.
            let _ = std::fs::remove_file(&tmp);
            if !out.exists() {
                return Err(e.into());
            }
        }
        Ok(out.to_string_lossy().into_owned())
    } else {
        let _ = std::fs::remove_file(&tmp);
        Err(anyhow::anyhow!(
            "오디오 추출 실패 (code {:?})",
            status.code()
        ))
    }
}

// ─── get_waveform ─────────────────────────────────────────────────────────────

const WAVEFORM_POINTS: usize = 2000;

/// 오디오 파일에서 피크 파형 데이터를 추출한다 (캐시 포함)
pub fn get_waveform(audio_path: &str) -> Result<Vec<f32>> {
    let cache_path = format!("{audio_path}.waveform.json");
    if Path::new(&cache_path).exists() {
        if let Ok(data) = std::fs::read_to_string(&cache_path) {
            if let Ok(peaks) = serde_json::from_str::<Vec<f32>>(&data) {
                return Ok(peaks);
            }
        }
    }

    let peaks = extract_peaks(audio_path)?;
    let _ = std::fs::write(&cache_path, serde_json::to_string(&peaks)?);
    Ok(peaks)
}

fn extract_peaks(audio_path: &str) -> Result<Vec<f32>> {
    let output = Command::new(ffmpeg_bin())
        .args([
            "-hide_banner",
            "-i",
            audio_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "100",
            "-f",
            "f32le",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .context("ffmpeg 파형 추출 실패")?;

    let bytes = &output.stdout;
    if bytes.len() < 4 {
        return Ok(vec![0.0; WAVEFORM_POINTS]);
    }

    let len = bytes.len() / 4;
    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();

    let step = len as f64 / WAVEFORM_POINTS as f64;
    let mut peaks = Vec::with_capacity(WAVEFORM_POINTS);
    for i in 0..WAVEFORM_POINTS {
        let start = (i as f64 * step) as usize;
        let end = ((i + 1) as f64 * step) as usize;
        let end = end.min(len);
        let max = if start == end {
            samples
                .get(start.min(len - 1))
                .copied()
                .unwrap_or(0.0)
                .abs()
        } else {
            samples[start..end]
                .iter()
                .map(|x| x.abs())
                .fold(0.0_f32, f32::max)
        };
        peaks.push((max * 1000.0).round() / 1000.0);
    }

    // 최대 정규화
    let max_peak = peaks.iter().cloned().fold(0.0_f32, f32::max);
    if max_peak > 0.0 {
        for p in &mut peaks {
            *p = (*p / max_peak * 1000.0).round() / 1000.0;
        }
    }

    Ok(peaks)
}
