use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::types::{HistoryEntry, HistoryEntryMeta, TranscriptResult};

fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
}

fn file_of(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

pub fn save_entry(dir: &Path, meta: &HistoryEntryMeta, result: &TranscriptResult) -> Result<()> {
    anyhow::ensure!(is_safe_id(&meta.id), "유효하지 않은 보관함 id 입니다.");
    std::fs::create_dir_all(dir)?;
    let entry = HistoryEntry {
        meta: meta.clone(),
        result: result.clone(),
    };
    let json = serde_json::to_string(&entry)?;
    std::fs::write(file_of(dir, &meta.id), json)?;
    Ok(())
}

pub fn list_entries(dir: &Path) -> Result<Vec<HistoryEntryMeta>> {
    let read_dir = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return Ok(vec![]),
    };

    let mut metas: Vec<HistoryEntryMeta> = Vec::new();
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<HistoryEntry>(&raw) {
                metas.push(parsed.meta);
            }
        }
    }
    metas.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(metas)
}

pub fn get_entry(dir: &Path, id: &str) -> Result<Option<HistoryEntry>> {
    if !is_safe_id(id) {
        return Ok(None);
    }
    let path = file_of(dir, id);
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path)?;
    Ok(Some(serde_json::from_str(&raw)?))
}

pub fn delete_entry(dir: &Path, id: &str) -> Result<()> {
    if !is_safe_id(id) {
        return Ok(());
    }
    let path = file_of(dir, id);
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}
