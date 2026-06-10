/// wav2vec2-base 영어 vocabulary (Hugging Face facebook/wav2vec2-base-960h)
/// 인덱스 0: <pad> (CTC blank), 1: <unk>, 2: '|' (word boundary), 3-28: A-Z, 29: '\''
pub const WAV2VEC2_BASE_VOCAB: &[&str] = &[
    "<pad>", "<unk>", "|", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N",
    "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "'",
];

pub const WAV2VEC2_BLANK_ID: usize = 0;
pub const WAV2VEC2_WORD_BOUNDARY: usize = 2;

/// 텍스트를 wav2vec2-base vocab 인덱스로 변환한다
/// 공백은 word boundary '|'로, 알 수 없는 문자는 <unk>으로 처리
pub fn text_to_ids(text: &str) -> Vec<usize> {
    text.to_uppercase()
        .chars()
        .filter_map(|c| {
            if c == ' ' {
                Some(WAV2VEC2_WORD_BOUNDARY)
            } else if c == '\'' {
                Some(WAV2VEC2_VOCAB_LEN - 1)
            } else if c.is_ascii_alphabetic() {
                Some(3 + (c as usize - 'A' as usize))
            } else {
                None // 숫자·구두점 등 무시
            }
        })
        .collect()
}

const WAV2VEC2_VOCAB_LEN: usize = WAV2VEC2_BASE_VOCAB.len();

/// wav2vec2 프레임 수 → 초 변환 (stride 320 샘플, 16kHz)
pub fn frames_to_seconds(frame: usize) -> f64 {
    frame as f64 * 320.0 / 16000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── text_to_ids ───────────────────────────────────────────────────────────

    #[test]
    fn empty_string_returns_empty() {
        assert!(text_to_ids("").is_empty());
    }

    #[test]
    fn digits_and_punctuation_filtered() {
        assert!(
            text_to_ids("123!@#.,;:?").is_empty(),
            "숫자·구두점 전부 제거"
        );
    }

    #[test]
    fn uppercase_and_lowercase_same_ids() {
        assert_eq!(
            text_to_ids("hello"),
            text_to_ids("HELLO"),
            "대소문자 동일 처리"
        );
    }

    #[test]
    fn space_maps_to_word_boundary() {
        let ids = text_to_ids("A B");
        assert_eq!(ids[1], WAV2VEC2_WORD_BOUNDARY, "공백 → word boundary");
    }

    #[test]
    fn apostrophe_maps_to_last_token() {
        let ids = text_to_ids("it's");
        let apos_pos = ids.iter().position(|&id| id == WAV2VEC2_VOCAB_LEN - 1);
        assert!(apos_pos.is_some(), "아포스트로피 → vocab 마지막 인덱스");
    }

    #[test]
    fn all_26_letters_have_unique_ids() {
        let ids: Vec<usize> = (b'A'..=b'Z')
            .map(|c| text_to_ids(&(c as char).to_string())[0])
            .collect();
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), 26, "26개 알파벳 모두 서로 다른 ID");
    }

    #[test]
    fn no_blank_id_in_regular_text() {
        let ids = text_to_ids("hello world");
        assert!(
            !ids.contains(&WAV2VEC2_BLANK_ID),
            "일반 텍스트에 blank(0) 없어야 함"
        );
    }

    #[test]
    fn ids_within_vocab_bounds() {
        let ids = text_to_ids("hello world it's");
        for &id in &ids {
            assert!(id < WAV2VEC2_VOCAB_LEN, "ID {id} 는 vocab 범위 내여야 함");
        }
    }

    #[test]
    fn unicode_non_ascii_filtered() {
        assert!(text_to_ids("안녕하세요").is_empty(), "한국어는 모두 필터됨");
        assert!(text_to_ids("こんにちは").is_empty(), "일본어는 모두 필터됨");
        assert!(text_to_ids("你好").is_empty(), "중국어는 모두 필터됨");
    }

    // ── frames_to_seconds ────────────────────────────────────────────────────

    #[test]
    fn frame_zero_is_zero_seconds() {
        assert_eq!(frames_to_seconds(0), 0.0);
    }

    #[test]
    fn fifty_frames_is_one_second() {
        // 16000 / 320 = 50 frames per second
        assert!((frames_to_seconds(50) - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn frames_to_seconds_linear() {
        let f1 = frames_to_seconds(100);
        let f2 = frames_to_seconds(200);
        assert!((f2 - f1 * 2.0).abs() < f64::EPSILON, "선형 비례");
    }
}
