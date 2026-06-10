use crate::types::{ResplitOptions, Segment, TranscriptResult, Word};

const DEFAULT_MIN_PAUSE: f64 = 0.3;
const DEFAULT_GAP_FACTOR: f64 = 1.6;
const DEFAULT_CONTEXT_FACTOR: f64 = 2.0;
const DEFAULT_CONTEXT_CAP: usize = 72;

// ─── 언어 감지 ───────────────────────────────────────────────────────────────

fn is_hangul(c: char) -> bool {
    matches!(c, '\u{AC00}'..='\u{D7A3}' | '\u{1100}'..='\u{11FF}' | '\u{3130}'..='\u{318F}')
}
fn is_hiragana(c: char) -> bool {
    matches!(c, '\u{3040}'..='\u{309F}')
}
fn is_katakana(c: char) -> bool {
    matches!(c, '\u{30A0}'..='\u{30FF}')
}
fn is_cjk(c: char) -> bool {
    matches!(c, '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}' | '\u{F900}'..='\u{FAFF}')
}

fn infer_language(text: &str, explicit: Option<&str>) -> String {
    if let Some(lang) = explicit {
        let base = lang.split(['-', '_']).next().unwrap_or(lang).to_lowercase();
        if !base.is_empty() {
            return base;
        }
    }
    if text.chars().any(is_hangul) {
        return "ko".into();
    }
    if text.chars().any(is_hiragana) {
        return "ja".into();
    }
    if text.chars().any(is_katakana) {
        return "ja".into();
    }
    if text.chars().any(is_cjk) {
        return "zh".into();
    }
    "en".into()
}

fn is_compact_language(lang: &str) -> bool {
    matches!(lang, "ja" | "zh" | "zh-cn" | "zh-tw")
}

// ─── 문장부호·의존어 패턴 ──────────────────────────────────────────────────

fn ends_sentence(text: &str) -> bool {
    let clean = clean_edge(text);
    clean.ends_with(['.', '!', '?', '。', '！', '？', '…', ',', '，', '、'])
}

fn clean_edge(text: &str) -> &str {
    text.trim()
        .trim_start_matches(['(', '"', '\'', '\u{2018}', '\u{201C}'])
        .trim_end_matches([')', '"', '\'', '\u{2019}', '\u{201D}'])
}

// 한국어 조사/어미
const KO_DEP_END: &[&str] = &[
    "이", "가", "은", "는", "을", "를", "의", "에", "와", "과", "도", "만", "로", "으로", "에게",
    "한테", "께", "부터", "까지", "보다", "처럼",
];
const KO_DEP_START: &[&str] = &[
    "것", "거", "건", "걸", "게", "수", "줄", "뿐", "데", "때", "정도",
];

// 영어 의존어
const EN_DEP_END: &[&str] = &[
    "a", "an", "the", "of", "to", "for", "from", "with", "in", "on", "at", "by", "as", "and", "or",
    "but", "is", "are", "was", "were", "will",
];
const EN_DEP_START: &[&str] = &["of", "to", "for", "with", "that", "which", "who"];

fn should_avoid_break(left: &Word, right: &Word, lang: &str) -> bool {
    let lc = clean_edge(&left.text).to_lowercase();
    let rc = clean_edge(&right.text).to_lowercase();
    match lang {
        "ko" => KO_DEP_END.contains(&lc.as_str()) || KO_DEP_START.contains(&rc.as_str()),
        "en" => EN_DEP_END.contains(&lc.as_str()) || EN_DEP_START.contains(&rc.as_str()),
        _ => false,
    }
}

// ─── 단어 보장 ────────────────────────────────────────────────────────────────

fn ensure_words(seg: &Segment, lang: &str) -> Vec<Word> {
    let words: Vec<Word> = seg
        .words
        .iter()
        .filter(|w| !w.text.trim().is_empty())
        .cloned()
        .collect();
    if !words.is_empty() {
        return words;
    }

    let tokens: Vec<&str> = if is_compact_language(lang) {
        seg.text
            .chars()
            .filter(|c| !c.is_whitespace())
            .map(|_| "")
            .collect() // placeholder — rebuild below
    } else {
        seg.text.split_whitespace().collect()
    };

    if is_compact_language(lang) {
        let chars: Vec<char> = seg.text.chars().filter(|c| !c.is_whitespace()).collect();
        if chars.is_empty() {
            return vec![];
        }
        let n = chars.len();
        let dur = (seg.end - seg.start).max(0.0);
        return chars
            .iter()
            .enumerate()
            .map(|(i, &c)| Word {
                text: c.to_string(),
                start: seg.start + dur * i as f64 / n as f64,
                end: if i + 1 == n {
                    seg.end
                } else {
                    seg.start + dur * (i + 1) as f64 / n as f64
                },
                score: 0.0,
            })
            .collect();
    }

    let n = tokens.len();
    if n == 0 {
        return vec![];
    }
    let dur = (seg.end - seg.start).max(0.0);
    tokens
        .iter()
        .enumerate()
        .map(|(i, &tok)| Word {
            text: tok.to_string(),
            start: seg.start + dur * i as f64 / n as f64,
            end: if i + 1 == n {
                seg.end
            } else {
                seg.start + dur * (i + 1) as f64 / n as f64
            },
            score: 0.0,
        })
        .collect()
}

// ─── 갭 / 임계값 ─────────────────────────────────────────────────────────────

fn gaps_of(words: &[Word]) -> Vec<f64> {
    words
        .windows(2)
        .map(|w| (w[1].start - w[0].end).max(0.0))
        .collect()
}

fn median(vals: &[f64]) -> f64 {
    if vals.is_empty() {
        return 0.0;
    }
    let mut sorted = vals.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mid = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    }
}

fn pause_threshold(gaps: &[f64], min_pause: f64, gap_factor: f64) -> f64 {
    if gaps.len() < 4 {
        return min_pause;
    }
    min_pause.max(median(gaps) * gap_factor)
}

// ─── 분할 ─────────────────────────────────────────────────────────────────────

fn join_words(words: &[Word], lang: &str) -> String {
    if is_compact_language(lang) {
        words.iter().map(|w| w.text.as_str()).collect()
    } else {
        words
            .iter()
            .map(|w| w.text.as_str())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

fn line_chars(words: &[Word], lang: &str) -> usize {
    join_words(words, lang).chars().count()
}

fn context_limit(max_chars: usize) -> usize {
    max_chars
        .max((max_chars as f64 * DEFAULT_CONTEXT_FACTOR).ceil() as usize)
        .min(DEFAULT_CONTEXT_CAP)
}

fn chunk_to_seg(words: Vec<Word>, lang: &str) -> Segment {
    Segment {
        start: words[0].start,
        end: words[words.len() - 1].end,
        text: join_words(&words, lang),
        words,
    }
}

fn split_single_segment(
    seg: &Segment,
    max_chars: usize,
    min_pause: f64,
    gap_factor: f64,
    lang: &str,
) -> Vec<Segment> {
    let words = ensure_words(seg, lang);
    if words.is_empty() {
        return vec![seg.clone()];
    }

    let gaps = gaps_of(&words);
    let threshold = pause_threshold(&gaps, min_pause, gap_factor);
    let ctx_lim = context_limit(max_chars);

    let mut chunks: Vec<Vec<Word>> = Vec::new();
    let mut current: Vec<Word> = Vec::new();
    let n = words.len();

    for i in 0..n {
        // 컨텍스트 한계 초과 시 강제 분할
        if !current.is_empty() {
            let mut test = current.clone();
            test.push(words[i].clone());
            if line_chars(&test, lang) > ctx_lim {
                if !should_avoid_break(&current[current.len() - 1], &words[i], lang) {
                    chunks.push(current);
                    current = Vec::new();
                } else {
                    // 역방향 탐색으로 폴백 경계 찾기
                    let fb = (0..current.len().saturating_sub(1))
                        .rev()
                        .find(|&j| !should_avoid_break(&current[j], &current[j + 1], lang));
                    if let Some(fb) = fb {
                        chunks.push(current[..=fb].to_vec());
                        current = current[fb + 1..].to_vec();
                    } else {
                        chunks.push(current);
                        current = Vec::new();
                    }
                }
            }
        }
        current.push(words[i].clone());

        if i == n - 1 {
            chunks.push(current);
            break;
        }

        // 자연 경계 판단
        let natural = ends_sentence(clean_edge(&words[i].text))
            || (gaps[i] >= threshold && !should_avoid_break(&words[i], &words[i + 1], lang));

        if natural {
            if is_compact_language(lang) && line_chars(&current, lang) <= max_chars {
                continue; // 작은 줄은 아직 이어붙인다
            }
            chunks.push(current);
            current = Vec::new();
        }
    }

    chunks.into_iter().map(|c| chunk_to_seg(c, lang)).collect()
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

#[cfg(test)]
pub(crate) fn infer_language_pub(text: &str, explicit: Option<&str>) -> String {
    infer_language(text, explicit)
}

pub fn resplit_result(result: &TranscriptResult, options: &ResplitOptions) -> TranscriptResult {
    let max_chars = (options.max_chars as usize).max(1);
    let min_pause = options.min_pause.unwrap_or(DEFAULT_MIN_PAUSE);
    let gap_factor = options.gap_factor.unwrap_or(DEFAULT_GAP_FACTOR);
    let explicit_lang = options.language.as_deref();

    let segments: Vec<Segment> = result
        .segments
        .iter()
        .flat_map(|seg| {
            if seg.text.trim().is_empty() {
                return vec![seg.clone()];
            }
            let lang = infer_language(&seg.text, explicit_lang.or(Some(&result.language)));
            split_single_segment(seg, max_chars, min_pause, gap_factor, &lang)
        })
        .collect();

    TranscriptResult {
        language: result.language.clone(),
        segments,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ResplitOptions, Segment, TranscriptResult, Word};

    fn opts(max_chars: u32) -> ResplitOptions {
        ResplitOptions {
            max_chars,
            language: None,
            min_pause: None,
            gap_factor: None,
        }
    }

    fn opts_lang(max_chars: u32, lang: &str) -> ResplitOptions {
        ResplitOptions {
            max_chars,
            language: Some(lang.to_string()),
            min_pause: None,
            gap_factor: None,
        }
    }

    fn make_word(text: &str, start: f64, end: f64) -> Word {
        Word {
            text: text.to_string(),
            start,
            end,
            score: 0.9,
        }
    }

    fn seg_no_words(text: &str, start: f64, end: f64) -> Segment {
        Segment {
            start,
            end,
            text: text.to_string(),
            words: vec![],
        }
    }

    fn seg_with_words(text: &str, words: Vec<Word>) -> Segment {
        let start = words.first().map(|w| w.start).unwrap_or(0.0);
        let end = words.last().map(|w| w.end).unwrap_or(0.0);
        Segment {
            start,
            end,
            text: text.to_string(),
            words,
        }
    }

    fn result(segs: Vec<Segment>) -> TranscriptResult {
        TranscriptResult {
            language: "en".to_string(),
            segments: segs,
        }
    }

    // ── infer_language ────────────────────────────────────────────────────────

    #[test]
    fn infer_explicit_language_takes_priority() {
        assert_eq!(infer_language_pub("안녕하세요", Some("en")), "en");
        assert_eq!(infer_language_pub("hello", Some("ko")), "ko");
    }

    #[test]
    fn infer_explicit_language_normalizes_region_code() {
        assert_eq!(infer_language_pub("x", Some("zh-CN")), "zh");
        assert_eq!(infer_language_pub("x", Some("en-US")), "en");
    }

    #[test]
    fn infer_explicit_empty_string_falls_through_to_detection() {
        assert_eq!(infer_language_pub("안녕", Some("")), "ko");
    }

    #[test]
    fn infer_korean_from_hangul() {
        assert_eq!(infer_language_pub("안녕하세요", None), "ko");
    }

    #[test]
    fn infer_japanese_from_hiragana() {
        assert_eq!(infer_language_pub("こんにちは", None), "ja");
    }

    #[test]
    fn infer_japanese_from_katakana() {
        assert_eq!(infer_language_pub("コンピュータ", None), "ja");
    }

    #[test]
    fn infer_chinese_from_cjk() {
        assert_eq!(infer_language_pub("你好", None), "zh");
    }

    #[test]
    fn infer_fallback_to_english() {
        assert_eq!(infer_language_pub("hello world", None), "en");
        assert_eq!(infer_language_pub("12345!@#", None), "en");
        assert_eq!(infer_language_pub("", None), "en");
    }

    // ── resplit_result: 에러/엣지 케이스 ─────────────────────────────────────

    #[test]
    fn resplit_empty_result_unchanged() {
        let r = result(vec![]);
        let out = resplit_result(&r, &opts(40));
        assert!(out.segments.is_empty());
        assert_eq!(out.language, "en");
    }

    #[test]
    fn resplit_zero_max_chars_clamped_to_one() {
        let r = result(vec![seg_no_words("hello world", 0.0, 2.0)]);
        let out = resplit_result(&r, &opts(0));
        // 0 → 1로 클램프, 단어별로 쪼개지지만 패닉 없어야 함
        assert!(!out.segments.is_empty());
        assert!(out.segments.len() >= 1);
    }

    #[test]
    fn resplit_whitespace_only_segment_passed_through() {
        let r = result(vec![seg_no_words("   \t  ", 0.0, 1.0)]);
        let out = resplit_result(&r, &opts(40));
        // 빈 텍스트 세그먼트는 그대로 통과
        assert_eq!(out.segments.len(), 1);
    }

    #[test]
    fn resplit_very_large_max_chars_does_not_split() {
        let long_text = "a".repeat(200);
        let r = result(vec![seg_no_words(&long_text, 0.0, 10.0)]);
        let out = resplit_result(&r, &opts(9999));
        assert_eq!(
            out.segments.len(),
            1,
            "충분히 큰 max_chars 면 분할 없어야 함"
        );
    }

    #[test]
    fn resplit_preserves_language_field() {
        let mut r = result(vec![seg_no_words("hello", 0.0, 1.0)]);
        r.language = "ja".to_string();
        let out = resplit_result(&r, &opts(40));
        assert_eq!(out.language, "ja");
    }

    #[test]
    fn resplit_segment_without_words_still_works() {
        // words 없는 세그먼트도 선형 보간으로 처리되어야 함
        let r = result(vec![seg_no_words(
            "first second third fourth fifth",
            0.0,
            5.0,
        )]);
        let out = resplit_result(&r, &opts(10));
        assert!(!out.segments.is_empty());
        for seg in &out.segments {
            assert!(seg.end >= seg.start, "end >= start 보장");
        }
    }

    #[test]
    fn resplit_timestamps_monotonically_increasing() {
        let words = vec![
            make_word("one", 0.0, 0.5),
            make_word("two", 0.5, 1.0),
            make_word("three", 1.0, 1.5),
            make_word("four", 1.5, 2.0),
        ];
        let r = result(vec![seg_with_words("one two three four", words)]);
        let out = resplit_result(&r, &opts(8));
        let mut prev_end = -1.0_f64;
        for seg in &out.segments {
            assert!(seg.start >= 0.0);
            assert!(seg.end >= seg.start);
            // 세그먼트들이 시간 순서대로 정렬
            assert!(
                seg.start >= prev_end - 1e-9,
                "세그먼트 시간 역전: {prev_end} > {}",
                seg.start
            );
            prev_end = seg.end;
        }
    }

    #[test]
    fn resplit_cjk_language_explicit() {
        let r = result(vec![seg_no_words("你好世界こんにちは안녕하세요", 0.0, 6.0)]);
        let out = resplit_result(&r, &opts_lang(4, "zh"));
        assert!(!out.segments.is_empty(), "CJK 분할 실패하지 않아야 함");
        for seg in &out.segments {
            assert!(seg.text.chars().count() <= 8, "컨텍스트 한계 내여야 함");
        }
    }

    // ── median / pause_threshold ──────────────────────────────────────────────

    #[test]
    fn median_empty_returns_zero() {
        assert_eq!(median(&[]), 0.0);
    }

    #[test]
    fn median_single_element() {
        assert_eq!(median(&[5.0]), 5.0);
    }

    #[test]
    fn median_even_count_averages_middle_two() {
        let vals = [1.0, 2.0, 3.0, 4.0];
        assert!((median(&vals) - 2.5).abs() < f64::EPSILON);
    }

    #[test]
    fn pause_threshold_fewer_than_4_gaps_returns_min_pause() {
        let gaps = [0.1_f64, 0.2, 0.3];
        assert_eq!(pause_threshold(&gaps, 0.5, 1.6), 0.5);
    }

    #[test]
    fn gaps_of_single_word_empty() {
        let words = vec![make_word("x", 0.0, 1.0)];
        assert!(gaps_of(&words).is_empty());
    }

    #[test]
    fn gaps_of_overlapping_words_clamped_to_zero() {
        let words = vec![
            make_word("a", 0.0, 1.0),
            make_word("b", 0.5, 1.5), // 겹침
        ];
        let gaps = gaps_of(&words);
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0], 0.0, "겹치는 단어의 gap 은 0으로 클램프");
    }
}
