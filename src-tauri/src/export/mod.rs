use crate::types::{ExportFormat, TranscriptResult};

/// 초 → "HH:MM:SS{sep}mmm"  (sep = ',' for SRT, '.' for VTT)
fn format_timecode(seconds: f64, ms_sep: char) -> String {
    let clamped = seconds.max(0.0);
    let total_ms = (clamped * 1000.0).round() as u64;
    let ms = total_ms % 1000;
    let total_sec = total_ms / 1000;
    let s = total_sec % 60;
    let m = (total_sec / 60) % 60;
    let h = total_sec / 3600;
    format!("{h:02}:{m:02}:{s:02}{ms_sep}{ms:03}")
}

pub fn to_srt(result: &TranscriptResult) -> String {
    let mut out = String::new();
    for (i, seg) in result.segments.iter().enumerate() {
        let start = format_timecode(seg.start, ',');
        let end = format_timecode(seg.end, ',');
        out.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            start,
            end,
            seg.text.trim()
        ));
    }
    out
}

pub fn to_vtt(result: &TranscriptResult, include_words: bool) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for seg in &result.segments {
        let start = format_timecode(seg.start, '.');
        let end = format_timecode(seg.end, '.');
        let body = if include_words && !seg.words.is_empty() {
            seg.words
                .iter()
                .map(|w| format!("<{}>{}", format_timecode(w.start, '.'), w.text))
                .collect::<Vec<_>>()
                .join(" ")
                .trim()
                .to_string()
        } else {
            seg.text.trim().to_string()
        };
        out.push_str(&format!("{start} --> {end}\n{body}\n\n"));
    }
    out
}

pub fn to_json(result: &TranscriptResult, include_words: bool) -> String {
    if include_words {
        serde_json::to_string_pretty(result).unwrap_or_default()
    } else {
        #[derive(serde::Serialize)]
        struct SegNoWords<'a> {
            start: f64,
            end: f64,
            text: &'a str,
            words: Vec<()>,
        }
        #[derive(serde::Serialize)]
        struct ResultNoWords<'a> {
            language: &'a str,
            segments: Vec<SegNoWords<'a>>,
        }
        let stripped = ResultNoWords {
            language: &result.language,
            segments: result
                .segments
                .iter()
                .map(|s| SegNoWords {
                    start: s.start,
                    end: s.end,
                    text: &s.text,
                    words: vec![],
                })
                .collect(),
        };
        serde_json::to_string_pretty(&stripped).unwrap_or_default()
    }
}

pub fn serialize(result: &TranscriptResult, format: &ExportFormat, include_words: bool) -> String {
    match format {
        ExportFormat::Srt => to_srt(result),
        ExportFormat::Vtt => to_vtt(result, include_words),
        ExportFormat::Json => to_json(result, include_words),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Segment, TranscriptResult, Word};

    fn seg(text: &str, start: f64, end: f64) -> Segment {
        Segment {
            start,
            end,
            text: text.to_string(),
            words: vec![],
        }
    }

    fn word(text: &str, start: f64, end: f64) -> Word {
        Word {
            text: text.to_string(),
            start,
            end,
            score: 1.0,
        }
    }

    fn result(segs: Vec<Segment>) -> TranscriptResult {
        TranscriptResult {
            language: "en".to_string(),
            segments: segs,
        }
    }

    // ── format_timecode ───────────────────────────────────────────────────────

    #[test]
    fn timecode_zero() {
        assert_eq!(format_timecode(0.0, ','), "00:00:00,000");
        assert_eq!(format_timecode(0.0, '.'), "00:00:00.000");
    }

    #[test]
    fn timecode_negative_clamped_to_zero() {
        assert_eq!(format_timecode(-5.0, ','), "00:00:00,000");
    }

    #[test]
    fn timecode_exact_one_hour() {
        assert_eq!(format_timecode(3600.0, ','), "01:00:00,000");
    }

    #[test]
    fn timecode_sub_second_rounding() {
        assert_eq!(format_timecode(1.5, ','), "00:00:01,500");
        assert_eq!(format_timecode(1.999, ','), "00:00:01,999");
    }

    #[test]
    fn timecode_very_large_value() {
        // 99시간 이상도 오버플로 없이 포맷되어야 함
        let out = format_timecode(360000.0, ',');
        assert!(out.contains(':'), "타임코드 형식 유지 필요: {out}");
    }

    // ── to_srt ────────────────────────────────────────────────────────────────

    #[test]
    fn srt_empty_result_is_empty_string() {
        assert_eq!(to_srt(&result(vec![])), "");
    }

    #[test]
    fn srt_single_segment_format() {
        let r = result(vec![seg(" Hello", 1.0, 2.5)]);
        let out = to_srt(&r);
        assert!(out.starts_with("1\n"), "SRT 인덱스 1로 시작");
        assert!(out.contains("00:00:01,000 --> 00:00:02,500"));
        assert!(out.contains("Hello"), "텍스트 trim 적용");
    }

    #[test]
    fn srt_multiple_segments_numbered_sequentially() {
        let r = result(vec![
            seg("first", 0.0, 1.0),
            seg("second", 1.0, 2.0),
            seg("third", 2.0, 3.0),
        ]);
        let out = to_srt(&r);
        assert!(out.contains("1\n"), "인덱스 1");
        assert!(out.contains("2\n"), "인덱스 2");
        assert!(out.contains("3\n"), "인덱스 3");
        assert!(!out.contains("4\n"), "인덱스 4 없어야 함");
    }

    #[test]
    fn srt_empty_segment_text_trimmed() {
        let r = result(vec![seg("  \t  ", 0.0, 1.0)]);
        let out = to_srt(&r);
        assert!(out.contains("1\n"), "빈 텍스트도 SRT 항목 생성");
    }

    #[test]
    fn srt_special_characters_preserved() {
        let r = result(vec![seg("<i>Hello</i> & \"world\"", 0.0, 1.0)]);
        let out = to_srt(&r);
        assert!(out.contains("<i>Hello</i>"), "HTML 태그 그대로 유지");
        assert!(out.contains('"'), "따옴표 유지");
    }

    // ── to_vtt ────────────────────────────────────────────────────────────────

    #[test]
    fn vtt_always_starts_with_webvtt_header() {
        assert!(to_vtt(&result(vec![]), false).starts_with("WEBVTT\n\n"));
        assert!(to_vtt(&result(vec![seg("x", 0.0, 1.0)]), false).starts_with("WEBVTT\n\n"));
    }

    #[test]
    fn vtt_empty_result_only_header() {
        let out = to_vtt(&result(vec![]), false);
        assert_eq!(out, "WEBVTT\n\n");
    }

    #[test]
    fn vtt_uses_dot_separator() {
        let r = result(vec![seg("test", 0.5, 1.5)]);
        let out = to_vtt(&r, false);
        assert!(out.contains("00:00:00.500 --> 00:00:01.500"));
        assert!(!out.contains(','), "VTT는 쉼표 사용 불가");
    }

    #[test]
    fn vtt_include_words_true_formats_cue_tags() {
        let mut s = seg("", 0.0, 2.0);
        s.words = vec![word("hello", 0.0, 1.0), word("world", 1.0, 2.0)];
        let r = result(vec![s]);
        let out = to_vtt(&r, true);
        assert!(out.contains("<00:00:00.000>"), "단어 타임스탬프 포함");
        assert!(out.contains("hello"), "단어 텍스트 포함");
    }

    #[test]
    fn vtt_include_words_false_uses_segment_text() {
        let mut s = seg("full text", 0.0, 2.0);
        s.words = vec![word("full", 0.0, 1.0), word("text", 1.0, 2.0)];
        let r = result(vec![s]);
        let out = to_vtt(&r, false);
        assert!(
            out.contains("full text"),
            "단어 모드 OFF 시 세그먼트 텍스트 사용"
        );
        assert!(!out.contains('<'), "단어 태그 없어야 함");
    }

    #[test]
    fn vtt_words_empty_falls_back_to_segment_text() {
        let r = result(vec![seg("fallback text", 0.0, 1.0)]);
        let out = to_vtt(&r, true); // include_words=true 지만 words 없음
        assert!(
            out.contains("fallback text"),
            "words 없을 때 세그먼트 텍스트 폴백"
        );
    }

    // ── to_json ───────────────────────────────────────────────────────────────

    #[test]
    fn json_output_is_valid_json() {
        let r = result(vec![seg("hello", 0.0, 1.0)]);
        let out = to_json(&r, false);
        let parsed: serde_json::Value = serde_json::from_str(&out).expect("유효한 JSON이어야 함");
        assert_eq!(parsed["language"], "en");
        assert!(parsed["segments"].is_array());
    }

    #[test]
    fn json_include_words_false_strips_word_data() {
        let mut s = seg("hello", 0.0, 1.0);
        s.words = vec![word("hello", 0.0, 1.0)];
        let r = result(vec![s]);
        let out = to_json(&r, false);
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        let words = &parsed["segments"][0]["words"];
        assert!(
            words.as_array().map(|a| a.is_empty()).unwrap_or(true),
            "단어 데이터 제거됨"
        );
    }

    #[test]
    fn json_include_words_true_preserves_word_data() {
        let mut s = seg("hello", 0.0, 1.0);
        s.words = vec![word("hello", 0.0, 1.0)];
        let r = result(vec![s]);
        let out = to_json(&r, true);
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        let words = &parsed["segments"][0]["words"];
        assert_eq!(
            words.as_array().map(|a| a.len()),
            Some(1),
            "단어 데이터 유지"
        );
    }

    #[test]
    fn json_empty_result_valid() {
        let out = to_json(&result(vec![]), false);
        let parsed: serde_json::Value = serde_json::from_str(&out).expect("빈 결과도 유효한 JSON");
        assert_eq!(parsed["segments"].as_array().map(|a| a.len()), Some(0));
    }
}
