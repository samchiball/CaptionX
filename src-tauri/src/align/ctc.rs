/// CTC forced alignment — trellis DP + backtracking
///
/// # Input
/// - `emission`: `[T, V]` — log probability of the vocabulary at each frame t
/// - `transcript_ids`: sequence of character indices to align (excluding blank)
/// - `blank_id`: index of the CTC blank token (usually 0)
///
/// # Returns
/// A vector of `(start_frame, end_frame)` tuples for each character
pub fn forced_align(
    emission: &[Vec<f32>],
    transcript_ids: &[usize],
    blank_id: usize,
) -> Vec<(usize, usize)> {
    let t_len = emission.len();
    let c_len = transcript_ids.len();
    if t_len == 0 || c_len == 0 {
        return vec![(0, 0); c_len];
    }

    // Extended transcript: [blank, c0, blank, c1, blank, c2, ..., blank]
    // Length = 2 * c_len + 1
    let s_len = 2 * c_len + 1;
    let ext: Vec<usize> = (0..s_len)
        .map(|i| {
            if i % 2 == 0 {
                blank_id
            } else {
                transcript_ids[i / 2]
            }
        })
        .collect();

    const NEG_INF: f32 = f32::NEG_INFINITY;

    // trellis[t * s_len + s] = max log probability of being at position s of the extended transcript at frame t
    let mut trellis = vec![NEG_INF; t_len * s_len];

    // Initialization: at t=0, can start at blank or the first character
    trellis[0] = emission[0][blank_id];
    if c_len > 0 {
        trellis[1] = emission[0][transcript_ids[0]];
    }

    // Forward DP
    for t in 1..t_len {
        for s in 0..s_len {
            let token_id = ext[s];
            let emit = emission[t][token_id];

            // Candidates for transition from previous state
            let mut best = trellis[(t - 1) * s_len + s]; // stay

            if s > 0 {
                // Step forward from the previous state
                let prev = trellis[(t - 1) * s_len + (s - 1)];
                if prev > best {
                    best = prev;
                }
            }
            // Transition skipping blank: if s >= 2, ext[s] != blank, and ext[s-2] != ext[s]
            if s >= 2 && token_id != blank_id && ext[s - 2] != token_id {
                let prev2 = trellis[(t - 1) * s_len + (s - 2)];
                if prev2 > best {
                    best = prev2;
                }
            }

            trellis[t * s_len + s] = if best == NEG_INF {
                NEG_INF
            } else {
                best + emit
            };
        }
    }

    // Backtracking: select the ending state with the highest probability at the last frame (s_len-1 or s_len-2)
    let last_row_start = (t_len - 1) * s_len;
    let mut cur_s = if trellis[last_row_start + s_len - 1] >= trellis[last_row_start + s_len - 2] {
        s_len - 1
    } else {
        s_len - 2
    };

    let mut char_frames: Vec<(usize, usize)> = vec![(0, 0); c_len];
    let mut t = t_len - 1;

    while t > 0 && cur_s > 0 {
        // If the current state is a character (odd index), record the frame
        if cur_s % 2 == 1 {
            let char_idx = cur_s / 2;
            // end_frame: current frame if not recorded yet
            if char_frames[char_idx].1 == 0 {
                char_frames[char_idx].1 = t;
            }
            char_frames[char_idx].0 = t; // Continuously update start_frame
        }

        // Backward transition: determine if stay was dominant or if it came from a previous state
        let prev_row_start = (t - 1) * s_len;
        let stay = trellis[prev_row_start + cur_s];
        let from_prev = if cur_s > 0 {
            trellis[prev_row_start + cur_s - 1]
        } else {
            NEG_INF
        };
        let from_prev2 = if cur_s >= 2 && ext[cur_s] != blank_id && ext[cur_s - 2] != ext[cur_s] {
            trellis[prev_row_start + cur_s - 2]
        } else {
            NEG_INF
        };

        if from_prev2 >= stay && from_prev2 >= from_prev {
            cur_s -= 2;
        } else if from_prev >= stay {
            cur_s -= 1;
        }
        // else: stay

        t -= 1;
    }

    char_frames
}

/// Converts a slice of logits to log-softmax
pub fn log_softmax(logits: &[f32]) -> Vec<f32> {
    let max = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let exp: Vec<f32> = logits.iter().map(|x| (x - max).exp()).collect();
    let sum_exp: f32 = exp.iter().sum();
    let log_sum = sum_exp.ln();
    exp.iter().map(|e| e.ln() - log_sum).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BLANK: usize = 0;
    const A: usize = 1;
    const B: usize = 2;

    /// Uniform emission — all tokens have equal probability at all frames
    fn uniform(t_len: usize, vocab: usize) -> Vec<Vec<f32>> {
        vec![vec![1.0 / vocab as f32; vocab]; t_len]
    }

    // ── forced_align ─────────────────────────────────────────────────────────

    #[test]
    fn empty_emission_returns_zero_pairs() {
        let r = forced_align(&[], &[A, B], BLANK);
        assert_eq!(r.len(), 2);
        assert!(r.iter().all(|&(s, e)| s == 0 && e == 0));
    }

    #[test]
    fn empty_transcript_returns_empty() {
        let emission = uniform(10, 3);
        let r = forced_align(&emission, &[], BLANK);
        assert!(r.is_empty());
    }

    #[test]
    fn single_char_returns_one_pair() {
        let emission = uniform(5, 3);
        let r = forced_align(&emission, &[A], BLANK);
        assert_eq!(r.len(), 1);
        let (s, e) = r[0];
        assert!(s <= e, "start <= end");
        assert!(e < 5, "end < t_len");
    }

    #[test]
    fn test_result_length_equals_transcript_length() {
        let emission = uniform(20, 5);
        let ids: Vec<usize> = vec![1, 2, 3, 4];
        let r = forced_align(&emission, &ids, BLANK);
        assert_eq!(r.len(), ids.len());
    }

    #[test]
    fn frames_non_decreasing() {
        // start/end in forced alignment results must progress forward
        let emission = uniform(30, 4);
        let ids = vec![A, B, A, B];
        let r = forced_align(&emission, &ids, BLANK);
        let mut prev_end = 0usize;
        for (s, e) in &r {
            assert!(*s <= *e, "start <= end for each character");
            assert!(*s >= prev_end.saturating_sub(1), "should have no backward alignment");
            prev_end = *e;
        }
    }

    #[test]
    fn single_frame_single_char_valid() {
        // 1 frame, 1 character — minimum case
        let emission = vec![vec![0.1_f32, 0.9, 0.0]]; // blank=0.1, A=0.9
        let r = forced_align(&emission, &[A], BLANK);
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn high_probability_token_at_specific_frame() {
        // A has very high probability at frame 3 -> A alignment should be in that range
        let mut emission = vec![vec![0.9_f32, 0.1]; 6]; // blank dominant
        emission[3] = vec![0.1, 0.9]; // A dominant at frame 3
        let r = forced_align(&emission, &[A], BLANK);
        assert_eq!(r.len(), 1);
        let (s, e) = r[0];
        assert!(
            s <= 3 && e >= 3,
            "A must be aligned within frame 3 (got {s}..{e})"
        );
    }

    // ── log_softmax ──────────────────────────────────────────────────────────

    #[test]
    fn log_softmax_single_element_is_zero() {
        let r = log_softmax(&[5.0]);
        assert!((r[0] - 0.0).abs() < 1e-6, "single element log-softmax = 0");
    }

    #[test]
    fn log_softmax_uniform_all_equal() {
        let r = log_softmax(&[2.0, 2.0, 2.0]);
        for v in &r {
            let diff = (v - r[0]).abs();
            assert!(diff < 1e-6, "log-softmax of uniform input must all be equal");
        }
    }

    #[test]
    fn log_softmax_exp_sums_to_one() {
        let logits = vec![1.0_f32, 2.0, 3.0, 4.0];
        let lsm = log_softmax(&logits);
        let sum: f32 = lsm.iter().map(|x| x.exp()).sum();
        assert!(
            (sum - 1.0).abs() < 1e-5,
            "sum of exp(log-softmax) = 1, actual: {sum}"
        );
    }

    #[test]
    fn log_softmax_numerically_stable_large_values() {
        let logits = vec![1000.0_f32, 1001.0, 999.0];
        let lsm = log_softmax(&logits);
        assert!(
            lsm.iter().all(|v| v.is_finite()),
            "should not overflow with large values"
        );
    }

    #[test]
    fn log_softmax_all_neg_inf_except_one() {
        let logits = vec![f32::NEG_INFINITY, f32::NEG_INFINITY, 1.0];
        let lsm = log_softmax(&logits);
        assert!(
            (lsm[2] - 0.0).abs() < 1e-5,
            "only finite value -> log-softmax = 0"
        );
    }

    #[test]
    fn log_softmax_empty_returns_empty() {
        assert!(log_softmax(&[]).is_empty());
    }
}
