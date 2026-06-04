// UI 다국어 번역 사전.
// ko 사전을 원본(소스 오브 트루스)으로 삼고, 다른 언어는 Messages 타입을 만족해야 한다.
// 새 UI 언어를 추가하려면: (1) UI_LOCALES 에 코드를 추가하고 (2) translations 에 같은 키의 사전을 더한다.

export const UI_LOCALES = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'de'] as const
export type UiLocale = (typeof UI_LOCALES)[number]

/** 언어 선택 메뉴에 표시할 라벨(각 언어의 자국어 표기) */
export const UI_LOCALE_LABELS: Record<UiLocale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch'
}

const ko = {
  // 탭
  'tab.transcribe': '전사',
  'tab.history': '보관함',

  // 컨트롤 라벨
  'controls.model': '모델',
  'controls.quantization': '양자화',
  'controls.language': '언어',
  'controls.alignMode': '정렬 방식',
  'controls.gpu': 'GPU 가속',
  'controls.vad': 'VAD 음성 구간 감지',
  'controls.denoise': '노이즈 및 배경음 제거',
  'controls.batchSize': '동시 전사 수',
  'controls.recommendedMax': '권장 최대: {n}개',
  'controls.clearDone': '완료 항목 비우기',
  'controls.cancelAll': '전체 취소',
  'controls.running': '전사 중…',
  'controls.run': '전사 시작',
  'controls.runWithCount': '전사 시작 ({n})',

  // 정렬 방식 옵션
  'align.none': '사용 안 함',
  'align.wav2vec2': 'wav2vec2 (정밀)',
  'align.mms': 'Meta MMS-300M (다국어)',

  // 툴팁
  'tooltip.model': '음성 인식에 사용할 Whisper 모델 입니다. whisper-large-v3-turbo 를 추천합니다.',
  'tooltip.quantization':
    '모델 가중치를 더 작은 정밀도로 압축해 메모리와 속도를 개선합니다. 단계가 높을수록 가벼워지지만 정확도가 조금 낮아질 수 있습니다.',
  'tooltip.language':
    '음성의 언어입니다. 자동 감지를 선택하면 첫 구간을 분석해 언어를 추정합니다. 언어를 지정하면 감지 단계를 건너뛰어 더 빠르고 오탐지 확률을 낮춥니다.',
  'tooltip.alignMode':
    'wav2vec2 모델로 단어 레벨 타임스탬프를 정밀하게 정렬합니다. 지원 모델이 없는 언어는 세그먼트 텍스트를 균등 분배한 근사 단어로 대체합니다.',
  'tooltip.gpu': 'GPU(CUDA 등)로 전사를 가속합니다. 지원 GPU가 없으면 CPU로 자동 전환됩니다.',
  'tooltip.vad':
    '음성 활동 감지(VAD)로 무음·잡음 구간을 건너뜁니다. 긴 침묵이 있는 파일에서 속도와 정확도를 높여줍니다.',
  'tooltip.denoise':
    '전사 전에 배경 잡음과 음악을 줄여 음성을 또렷하게 만듭니다. 소음이 많은 녹음에서 인식률이 좋아집니다.',
  'tooltip.batchSize':
    '큐에 있는 파일을 한 번에 동시에 전사할 개수입니다. 클수록 여러 파일을 함께 처리해 빠르지만 GPU·메모리를 더 씁니다. 권장 최대값을 넘으면 메모리 부족이 날 수 있습니다.',

  // 하드웨어 상태
  'hardware.title': '🖥️ 시스템 자원 및 모델 사양',
  'hardware.singleReq': '예상 소요 자원 (파일당):',
  'hardware.totalReq': '총 예상 자원 (배치 {n}개 기준):',
  'hardware.freeRam': '여유 시스템 RAM:',
  'hardware.freeVram': '여유 GPU VRAM:',
  'hardware.gpuUnavailable': '사용 불가능 또는 비가속',
  'hardware.warning':
    '⚠️ 설정된 배치 크기({batch})가 권장 한도({max}개)를 초과했습니다. 메모리 부족 오류가 발생할 수 있습니다.',

  // 테마 토글
  'theme.light': '라이트',
  'theme.dark': '다크',
  'theme.system': '시스템',
  'theme.toggleTitle': '테마 전환 (라이트 / 다크 / 시스템)',
  'theme.ariaLabel': '테마: {label}',

  // 언어 전환 토글
  'locale.label': '표시 언어',
  'locale.ariaLabel': '표시 언어 선택',

  // 드롭존
  'dropzone.title': '미디어 파일 추가',
  'dropzone.hint': '파일을 여기로 드래그하거나 클릭해 선택하세요 · 여러 개 동시 추가 가능',

  // 언어 드롭다운
  'language.auto': '자동 감지',

  // 큐 상태 배지
  'status.pending': '대기',
  'status.running': '처리 중',
  'status.done': '완료',
  'status.error': '오류',
  'status.canceled': '취소됨',

  // 큐 항목
  'queue.showSubtitle': '자막 보기',
  'queue.hide': '숨기기',
  'queue.cancel': '취소',
  'queue.removeAria': '제거',
  'queue.error': '오류: {message}',
  'queue.canceled': '작업이 취소되었습니다.',

  // 내보내기 바
  'export.format': '포맷',
  'export.includeWords': '단어 타임스탬프 포함',
  'export.run': '자막 내보내기',
  'export.saved': '저장됨: {path}',

  // 다시 나누기 바
  'resplit.maxChars': '권장 글자 수',
  'resplit.running': '나누는 중…',
  'resplit.run': '다시 나누기',
  'resplit.hint': '문맥(침묵·문장부호·조사/어미)에 맞춰 한 문장처럼 나눕니다',

  // 핫워드 편집기
  'hotwords.title': '핫워드 단어장',
  'hotwords.tooltip':
    '고유명사·전문용어를 등록하면 Whisper의 initial prompt로 주입돼 해당 단어의 인식 정확도가 올라갑니다.\n잘 틀리는 단어, 신조어등을 넣으면 더 잘 인식 할수 있습니다.\n쉼표나 줄바꿈으로 여러 개를 한 번에 넣을 수 있습니다.',
  'hotwords.hint': '고유명사·전문용어 인식 보정 ({n})',
  'hotwords.exportTxt': 'TXT 내보내기',
  'hotwords.clear': '전체 비우기',
  'hotwords.placeholder': '이름, 고유명사를 인식하기 쉽게 만들어주는 기능, 단어 입력 후 Enter',
  'hotwords.add': '추가',
  'hotwords.removeAria': '{term} 제거',

  // 보관함
  'history.title': '보관함',
  'history.refresh': '새로고침',
  'history.loading': '불러오는 중…',
  'history.empty': '저장된 전사 결과가 없습니다. 전사를 완료하면 자동으로 저장됩니다.',
  'history.segments': '{n}개 구간',
  'history.autoLanguage': '자동',
  'history.removeAria': '삭제',

  // 진행 바
  'stage.decode': '디코드',
  'stage.transcribe': '전사',
  'stage.align': '단어 정렬',
  'stage.export': '내보내기',
  'progress.preparing': '준비 중',
  'progress.elapsed': '경과 {duration}',
  'progress.remaining': '남은 시간 약 {duration}',
  'progress.message.decoding': '오디오 디코드 중',
  'progress.message.denoisePreparing': '음성 향상 모델 준비 중',
  'progress.message.denoiseDownloading': '음향 모델 다운로드 중',
  'progress.message.denoising': '음성 잡음 및 음악 제거 중',
  'progress.message.transcribePreparing': '전사 모델 준비 중',
  'progress.message.transcribeDownloading': '모델 다운로드 중',
  'progress.message.transcribing': 'Whisper 전사 중',
  'progress.message.alignPreparing': '정렬 모델 준비 중',
  'progress.message.alignDownloading': '정렬 모델 다운로드 중',
  'progress.message.aligning': '단어 정렬 중',
  'progress.message.aligningWithCount': '단어 정렬 중 ({current}/{total})',

  // 미디어 플레이어
  'media.preparing': '오디오 준비 중…',
  'media.error': '오디오를 준비하지 못했습니다.',

  // 전사 결과 뷰
  'transcript.language': '언어: {language}',
  'transcript.seekHere': '이 위치로 이동',

  // 양자화 콤보박스
  'quant.fp16': 'FP16 (원본 고품질)',
  'quant.fp16Desc': '정밀도 최상',
  'quant.q5': 'Q5 (양자화 경량화)',
  'quant.q5Desc': '자원 절약 최적',

  // 정보 툴팁
  'tooltip.helpLabel': '도움말',

  // 시스템 설정 창
  'settings.title': '시스템 설정',
  'settings.open': '시스템 설정 (Ctrl+,)',
  'settings.close': '닫기',
  'settings.transcription': '전사 성능',
  'settings.concurrency': '동시 전사 수',
  'settings.threads': 'Whisper 스레드 수',
  'settings.threadsAuto': '0 = 자동',
  'settings.uiTheme': 'UI 테마',
  'settings.uiTheme.default': '기본',
  'settings.uiTheme.doodle': '손그림',
  'tooltip.concurrency':
    '큐에 있는 파일을 한 번에 동시에 전사할 개수입니다. 클수록 여러 파일을 함께 처리해 빠르지만 GPU·메모리를 더 씁니다.',
  'tooltip.threads':
    '단일 전사 한 건이 사용하는 whisper.cpp CPU 스레드 수(n_threads)입니다. 동시 전사 수(파일 동시성)와는 다른 개념으로, 한 파일의 추론 속도에 영향을 줍니다. 0이면 시스템 코어 수에 맞춘 기본값을 사용합니다.',
  'settings.appInfo': '앱 정보',
  'settings.version': '현재 버전'
} as const

export type MessageKey = keyof typeof ko
export type Messages = Record<MessageKey, string>

const en: Messages = {
  'tab.transcribe': 'Transcribe',
  'tab.history': 'Library',

  'controls.model': 'Model',
  'controls.quantization': 'Quantization',
  'controls.language': 'Language',
  'controls.alignMode': 'Alignment',
  'controls.gpu': 'GPU acceleration',
  'controls.vad': 'VAD speech detection',
  'controls.denoise': 'Noise & background removal',
  'controls.batchSize': 'Concurrent jobs',
  'controls.recommendedMax': 'Recommended max: {n}',
  'controls.clearDone': 'Clear completed',
  'controls.cancelAll': 'Cancel all',
  'controls.running': 'Transcribing…',
  'controls.run': 'Start transcription',
  'controls.runWithCount': 'Start transcription ({n})',

  'align.none': 'Disabled',
  'align.wav2vec2': 'wav2vec2 (precise)',
  'align.mms': 'Meta MMS-300M (multilingual)',

  'tooltip.model':
    'The Whisper model used for speech recognition. whisper-large-v3-turbo is recommended.',
  'tooltip.quantization':
    'Compresses model weights to a smaller precision for better memory use and speed. Higher levels are lighter but may slightly reduce accuracy.',
  'tooltip.language':
    'The language of the audio. Auto-detect analyzes the first segment to estimate the language. Specifying a language skips detection, making it faster and reducing misdetection.',
  'tooltip.alignMode':
    'Word-level timestamps are aligned with a wav2vec2 model. Languages without a supported model fall back to approximate words spread evenly across each segment.',
  'tooltip.gpu':
    'Accelerates transcription with a GPU (CUDA, etc.). Falls back to CPU automatically if no supported GPU is found.',
  'tooltip.vad':
    'Voice activity detection (VAD) skips silent and noisy gaps. Improves speed and accuracy on files with long silences.',
  'tooltip.denoise':
    'Reduces background noise and music before transcription to make speech clearer. Improves recognition on noisy recordings.',
  'tooltip.batchSize':
    'How many queued files to transcribe at once. Higher values process more files together for speed but use more GPU and memory. Exceeding the recommended max may cause out-of-memory errors.',

  'hardware.title': '🖥️ System resources & model specs',
  'hardware.singleReq': 'Estimated resources (per file):',
  'hardware.totalReq': 'Total estimated resources (batch of {n}):',
  'hardware.freeRam': 'Free system RAM:',
  'hardware.freeVram': 'Free GPU VRAM:',
  'hardware.gpuUnavailable': 'Unavailable or not accelerated',
  'hardware.warning':
    '⚠️ The configured batch size ({batch}) exceeds the recommended limit ({max}). Out-of-memory errors may occur.',

  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'theme.toggleTitle': 'Switch theme (light / dark / system)',
  'theme.ariaLabel': 'Theme: {label}',

  'locale.label': 'Display language',
  'locale.ariaLabel': 'Select display language',

  'dropzone.title': 'Add media files',
  'dropzone.hint': 'Drag files here or click to select · multiple files supported',

  'language.auto': 'Auto-detect',

  'status.pending': 'Pending',
  'status.running': 'Running',
  'status.done': 'Done',
  'status.error': 'Error',
  'status.canceled': 'Canceled',

  'queue.showSubtitle': 'Show subtitles',
  'queue.hide': 'Hide',
  'queue.cancel': 'Cancel',
  'queue.removeAria': 'Remove',
  'queue.error': 'Error: {message}',
  'queue.canceled': 'The job was canceled.',

  'export.format': 'Format',
  'export.includeWords': 'Include word timestamps',
  'export.run': 'Export subtitles',
  'export.saved': 'Saved: {path}',

  'resplit.maxChars': 'Chars per line',
  'resplit.running': 'Splitting…',
  'resplit.run': 'Re-split',
  'resplit.hint':
    'Splits into sentence-like lines based on context (silence, punctuation, grammar)',

  'hotwords.title': 'Hotword dictionary',
  'hotwords.tooltip':
    'Registered proper nouns and jargon are injected into Whisper’s initial prompt to improve recognition of those words.\nAdding frequently misrecognized words or neologisms helps recognition.\nYou can add several at once separated by commas or line breaks.',
  'hotwords.hint': 'Proper noun & jargon correction ({n})',
  'hotwords.exportTxt': 'Export TXT',
  'hotwords.clear': 'Clear all',
  'hotwords.placeholder': 'Helps recognize names and proper nouns — type a word and press Enter',
  'hotwords.add': 'Add',
  'hotwords.removeAria': 'Remove {term}',

  'history.title': 'Library',
  'history.refresh': 'Refresh',
  'history.loading': 'Loading…',
  'history.empty':
    'No saved transcriptions yet. They are saved automatically when transcription completes.',
  'history.segments': '{n} segments',
  'history.autoLanguage': 'auto',
  'history.removeAria': 'Delete',

  'stage.decode': 'Decode',
  'stage.transcribe': 'Transcribe',
  'stage.align': 'Word alignment',
  'stage.export': 'Export',
  'progress.preparing': 'Preparing',
  'progress.elapsed': 'Elapsed {duration}',
  'progress.remaining': 'About {duration} remaining',
  'progress.message.decoding': 'Decoding audio...',
  'progress.message.denoisePreparing': 'Preparing audio enhancement model...',
  'progress.message.denoiseDownloading': 'Downloading audio enhancement model...',
  'progress.message.denoising': 'Removing voice noise and music...',
  'progress.message.transcribePreparing': 'Preparing transcription model...',
  'progress.message.transcribeDownloading': 'Downloading model...',
  'progress.message.transcribing': 'Whisper transcribing...',
  'progress.message.alignPreparing': 'Preparing alignment model...',
  'progress.message.alignDownloading': 'Downloading alignment model...',
  'progress.message.aligning': 'Aligning words...',
  'progress.message.aligningWithCount': 'Aligning words ({current}/{total})',

  'media.preparing': 'Preparing audio…',
  'media.error': 'Could not prepare audio.',

  'transcript.language': 'Language: {language}',
  'transcript.seekHere': 'Seek to this position',

  'quant.fp16': 'FP16 (original high quality)',
  'quant.fp16Desc': 'Highest precision',
  'quant.q5': 'Q5 (quantized lightweight)',
  'quant.q5Desc': 'Best for saving resources',

  'tooltip.helpLabel': 'Help',

  'settings.title': 'System settings',
  'settings.open': 'System settings (Ctrl+,)',
  'settings.close': 'Close',
  'settings.transcription': 'Transcription performance',
  'settings.concurrency': 'Concurrent jobs',
  'settings.threads': 'Whisper threads',
  'settings.threadsAuto': '0 = auto',
  'settings.uiTheme': 'UI Theme',
  'settings.uiTheme.default': 'Default',
  'settings.uiTheme.doodle': 'Doodle',
  'tooltip.concurrency':
    'How many queued files to transcribe at once. Higher values process more files together for speed but use more GPU and memory.',
  'tooltip.threads':
    'The number of whisper.cpp CPU threads (n_threads) a single transcription uses. This differs from concurrent jobs (file-level concurrency) and affects the inference speed of one file. 0 uses a default based on your CPU cores.',
  'settings.appInfo': 'App Info',
  'settings.version': 'Current Version'
}

const ja: Messages = {
  'tab.transcribe': '文字起こし',
  'tab.history': 'ライブラリ',

  'controls.model': 'モデル',
  'controls.quantization': '量子化',
  'controls.language': '言語',
  'controls.alignMode': 'アライメント',
  'controls.gpu': 'GPUアクセラレーション',
  'controls.vad': 'VAD 音声区間検出',
  'controls.denoise': 'ノイズ・背景音の除去',
  'controls.batchSize': '同時処理数',
  'controls.recommendedMax': '推奨最大: {n}',
  'controls.clearDone': '完了項目をクリア',
  'controls.cancelAll': 'すべてキャンセル',
  'controls.running': '文字起こし中…',
  'controls.run': '文字起こし開始',
  'controls.runWithCount': '文字起こし開始 ({n})',

  'align.none': '使用しない',
  'align.wav2vec2': 'wav2vec2（高精度）',
  'align.mms': 'Meta MMS-300M（多言語）',

  'tooltip.model': '音声認識に使用するWhisperモデルです。whisper-large-v3-turbo を推奨します。',
  'tooltip.quantization':
    'モデルの重みをより小さな精度に圧縮し、メモリ使用量と速度を改善します。レベルが高いほど軽くなりますが、精度がわずかに下がる場合があります。',
  'tooltip.language':
    '音声の言語です。自動検出は最初の区間を分析して言語を推定します。言語を指定すると検出を省略でき、より高速で誤検出を減らせます。',
  'tooltip.alignMode':
    'wav2vec2 モデルで単語レベルのタイムスタンプを精密に整列します。対応モデルがない言語は、各セグメントを均等に分割した近似単語で代替します。',
  'tooltip.gpu':
    'GPU（CUDA など）で文字起こしを高速化します。対応GPUがない場合は自動的にCPUに切り替わります。',
  'tooltip.vad':
    '音声区間検出（VAD）で無音・ノイズ区間をスキップします。長い無音のあるファイルで速度と精度を高めます。',
  'tooltip.denoise':
    '文字起こし前に背景ノイズや音楽を減らし、音声を明瞭にします。ノイズの多い録音で認識率が向上します。',
  'tooltip.batchSize':
    'キュー内のファイルを一度に同時処理する数です。大きいほど複数ファイルをまとめて処理して高速ですが、GPUとメモリをより多く使います。推奨最大値を超えるとメモリ不足になる場合があります。',

  'hardware.title': '🖥️ システムリソースとモデル仕様',
  'hardware.singleReq': '推定リソース（ファイルあたり）:',
  'hardware.totalReq': '合計推定リソース（バッチ {n} 件）:',
  'hardware.freeRam': '空きシステムRAM:',
  'hardware.freeVram': '空きGPU VRAM:',
  'hardware.gpuUnavailable': '利用不可または非アクセラレーション',
  'hardware.warning':
    '⚠️ 設定されたバッチサイズ（{batch}）が推奨上限（{max}）を超えています。メモリ不足エラーが発生する可能性があります。',

  'theme.light': 'ライト',
  'theme.dark': 'ダーク',
  'theme.system': 'システム',
  'theme.toggleTitle': 'テーマ切替（ライト / ダーク / システム）',
  'theme.ariaLabel': 'テーマ: {label}',

  'locale.label': '表示言語',
  'locale.ariaLabel': '表示言語を選択',

  'dropzone.title': 'メディアファイルを追加',
  'dropzone.hint': 'ファイルをここにドラッグするかクリックして選択 · 複数ファイル対応',

  'language.auto': '自動検出',

  'status.pending': '待機',
  'status.running': '処理中',
  'status.done': '完了',
  'status.error': 'エラー',
  'status.canceled': 'キャンセル済み',

  'queue.showSubtitle': '字幕を表示',
  'queue.hide': '非表示',
  'queue.cancel': 'キャンセル',
  'queue.removeAria': '削除',
  'queue.error': 'エラー: {message}',
  'queue.canceled': 'ジョブはキャンセルされました。',

  'export.format': 'フォーマット',
  'export.includeWords': '単語タイムスタンプを含める',
  'export.run': '字幕を書き出す',
  'export.saved': '保存しました: {path}',

  'resplit.maxChars': '1行あたりの文字数',
  'resplit.running': '分割中…',
  'resplit.run': '再分割',
  'resplit.hint': '文脈（無音・句読点・文法）に合わせて一文のように分割します',

  'hotwords.title': 'ホットワード辞書',
  'hotwords.tooltip':
    '登録した固有名詞や専門用語はWhisperのinitial promptに注入され、その単語の認識精度が向上します。\nよく誤認識される単語や新語を追加すると認識しやすくなります。\nカンマや改行で複数を一度に追加できます。',
  'hotwords.hint': '固有名詞・専門用語の補正 ({n})',
  'hotwords.exportTxt': 'TXT書き出し',
  'hotwords.clear': 'すべてクリア',
  'hotwords.placeholder': '名前や固有名詞を認識しやすくする機能 — 単語を入力してEnter',
  'hotwords.add': '追加',
  'hotwords.removeAria': '{term} を削除',

  'history.title': 'ライブラリ',
  'history.refresh': '更新',
  'history.loading': '読み込み中…',
  'history.empty':
    '保存された文字起こし結果はありません。文字起こしが完了すると自動的に保存されます。',
  'history.segments': '{n} 区間',
  'history.autoLanguage': '自動',
  'history.removeAria': '削除',

  'stage.decode': 'デコード',
  'stage.transcribe': '文字起こし',
  'stage.align': '単語整列',
  'stage.export': '書き出し',
  'progress.preparing': '準備中',
  'progress.elapsed': '経過 {duration}',
  'progress.remaining': '残り約 {duration}',
  'progress.message.decoding': 'オーディオをデコード中...',
  'progress.message.denoisePreparing': '音声向上モデルの準備中...',
  'progress.message.denoiseDownloading': '音声向上モデルのダウンロード中...',
  'progress.message.denoising': '音声ノイズと背景音の除去中...',
  'progress.message.transcribePreparing': '文字起こしモデルの準備中...',
  'progress.message.transcribeDownloading': 'モデルのダウンロード中...',
  'progress.message.transcribing': 'Whisper 文字起こし中...',
  'progress.message.alignPreparing': '整列モデルの準備中...',
  'progress.message.alignDownloading': '整列モデルのダウンロード中...',
  'progress.message.aligning': '単語の整列中...',
  'progress.message.aligningWithCount': '単語の整列中 ({current}/{total})',

  'media.preparing': 'オーディオ準備中…',
  'media.error': 'オーディオを準備できませんでした。',

  'transcript.language': '言語: {language}',
  'transcript.seekHere': 'この位置へ移動',

  'quant.fp16': 'FP16（オリジナル高品質）',
  'quant.fp16Desc': '最高精度',
  'quant.q5': 'Q5（量子化軽量）',
  'quant.q5Desc': 'リソース節約に最適',

  'tooltip.helpLabel': 'ヘルプ',

  'settings.title': 'システム設定',
  'settings.open': 'システム設定 (Ctrl+,)',
  'settings.close': '閉じる',
  'settings.transcription': '文字起こし性能',
  'settings.concurrency': '同時処理数',
  'settings.threads': 'Whisper  スレッド数',
  'settings.threadsAuto': '0 = 自動',
  'settings.uiTheme': 'UIテーマ',
  'settings.uiTheme.default': 'デフォルト',
  'settings.uiTheme.doodle': 'ドゥードゥル',
  'tooltip.concurrency':
    'キュー内のファイルを同時に文字起こしする数です。大きいほど複数を同時処理して速くなりますが、GPU・メモリをより多く使います。',
  'tooltip.threads':
    '1件の文字起こしが使う whisper.cpp の CPU スレッド数 (n_threads) です。同時処理数（ファイル並列）とは別概念で、1ファイルの推論速度に影響します。0 の場合は CPU コア数に応じた既定値を使います。',
  'settings.appInfo': 'アプリ情報',
  'settings.version': '現在のバージョン'
}

const es: Messages = {
  'tab.transcribe': 'Transcribir',
  'tab.history': 'Biblioteca',

  'controls.model': 'Modelo',
  'controls.quantization': 'Cuantización',
  'controls.language': 'Idioma',
  'controls.alignMode': 'Alineación',
  'controls.gpu': 'Aceleración por GPU',
  'controls.vad': 'Detección de voz VAD',
  'controls.denoise': 'Eliminación de ruido y fondo',
  'controls.batchSize': 'Trabajos simultáneos',
  'controls.recommendedMax': 'Máximo recomendado: {n}',
  'controls.clearDone': 'Limpiar completados',
  'controls.cancelAll': 'Cancelar todo',
  'controls.running': 'Transcribiendo…',
  'controls.run': 'Iniciar transcripción',
  'controls.runWithCount': 'Iniciar transcripción ({n})',

  'align.none': 'Desactivado',
  'align.wav2vec2': 'wav2vec2 (preciso)',
  'align.mms': 'Meta MMS-300M (multilingüe)',

  'tooltip.model':
    'El modelo Whisper usado para el reconocimiento de voz. Se recomienda whisper-large-v3-turbo.',
  'tooltip.quantization':
    'Comprime los pesos del modelo a una precisión menor para mejorar el uso de memoria y la velocidad. Los niveles más altos son más ligeros pero pueden reducir levemente la precisión.',
  'tooltip.language':
    'El idioma del audio. La detección automática analiza el primer segmento para estimar el idioma. Especificar un idioma omite la detección, haciéndolo más rápido y reduciendo errores.',
  'tooltip.alignMode':
    'Las marcas de tiempo por palabra se alinean con un modelo wav2vec2. Los idiomas sin modelo compatible usan palabras aproximadas distribuidas uniformemente en cada segmento.',
  'tooltip.gpu':
    'Acelera la transcripción con una GPU (CUDA, etc.). Cambia automáticamente a CPU si no hay GPU compatible.',
  'tooltip.vad':
    'La detección de actividad de voz (VAD) omite los silencios y el ruido. Mejora la velocidad y precisión en archivos con largos silencios.',
  'tooltip.denoise':
    'Reduce el ruido de fondo y la música antes de transcribir para que la voz sea más clara. Mejora el reconocimiento en grabaciones ruidosas.',
  'tooltip.batchSize':
    'Cuántos archivos en cola transcribir a la vez. Valores más altos procesan más archivos juntos para mayor velocidad, pero usan más GPU y memoria. Superar el máximo recomendado puede causar errores de falta de memoria.',

  'hardware.title': '🖥️ Recursos del sistema y especificaciones del modelo',
  'hardware.singleReq': 'Recursos estimados (por archivo):',
  'hardware.totalReq': 'Recursos totales estimados (lote de {n}):',
  'hardware.freeRam': 'RAM del sistema libre:',
  'hardware.freeVram': 'VRAM de GPU libre:',
  'hardware.gpuUnavailable': 'No disponible o sin aceleración',
  'hardware.warning':
    '⚠️ El tamaño de lote configurado ({batch}) supera el límite recomendado ({max}). Pueden producirse errores de falta de memoria.',

  'theme.light': 'Claro',
  'theme.dark': 'Oscuro',
  'theme.system': 'Sistema',
  'theme.toggleTitle': 'Cambiar tema (claro / oscuro / sistema)',
  'theme.ariaLabel': 'Tema: {label}',

  'locale.label': 'Idioma de la interfaz',
  'locale.ariaLabel': 'Seleccionar idioma de la interfaz',

  'dropzone.title': 'Añadir archivos multimedia',
  'dropzone.hint': 'Arrastra archivos aquí o haz clic para seleccionar · admite varios archivos',

  'language.auto': 'Detección automática',

  'status.pending': 'En espera',
  'status.running': 'En curso',
  'status.done': 'Hecho',
  'status.error': 'Error',
  'status.canceled': 'Cancelado',

  'queue.showSubtitle': 'Mostrar subtítulos',
  'queue.hide': 'Ocultar',
  'queue.cancel': 'Cancelar',
  'queue.removeAria': 'Eliminar',
  'queue.error': 'Error: {message}',
  'queue.canceled': 'El trabajo fue cancelado.',

  'export.format': 'Formato',
  'export.includeWords': 'Incluir marcas de tiempo por palabra',
  'export.run': 'Exportar subtítulos',
  'export.saved': 'Guardado: {path}',

  'resplit.maxChars': 'Caracteres por línea',
  'resplit.running': 'Dividiendo…',
  'resplit.run': 'Volver a dividir',
  'resplit.hint':
    'Divide en líneas tipo oración según el contexto (silencio, puntuación, gramática)',

  'hotwords.title': 'Diccionario de palabras clave',
  'hotwords.tooltip':
    'Los nombres propios y la jerga registrados se inyectan en el initial prompt de Whisper para mejorar su reconocimiento.\nAñadir palabras mal reconocidas con frecuencia o neologismos ayuda al reconocimiento.\nPuedes añadir varias a la vez separadas por comas o saltos de línea.',
  'hotwords.hint': 'Corrección de nombres propios y jerga ({n})',
  'hotwords.exportTxt': 'Exportar TXT',
  'hotwords.clear': 'Limpiar todo',
  'hotwords.placeholder':
    'Ayuda a reconocer nombres y nombres propios — escribe una palabra y pulsa Enter',
  'hotwords.add': 'Añadir',
  'hotwords.removeAria': 'Eliminar {term}',

  'history.title': 'Biblioteca',
  'history.refresh': 'Actualizar',
  'history.loading': 'Cargando…',
  'history.empty':
    'Aún no hay transcripciones guardadas. Se guardan automáticamente al completar la transcripción.',
  'history.segments': '{n} segmentos',
  'history.autoLanguage': 'auto',
  'history.removeAria': 'Eliminar',

  'stage.decode': 'Decodificar',
  'stage.transcribe': 'Transcribir',
  'stage.align': 'Alineación de palabras',
  'stage.export': 'Exportar',
  'progress.preparing': 'Preparando',
  'progress.elapsed': 'Transcurrido {duration}',
  'progress.remaining': 'Quedan unos {duration}',
  'progress.message.decoding': 'Decodificando audio...',
  'progress.message.denoisePreparing': 'Preparando modelo de mejora de voz...',
  'progress.message.denoiseDownloading': 'Descargando modelo de mejora de voz...',
  'progress.message.denoising': 'Eliminando ruido de voz y música...',
  'progress.message.transcribePreparing': 'Preparando modelo de transcripción...',
  'progress.message.transcribeDownloading': 'Descargando modelo...',
  'progress.message.transcribing': 'Whisper transcribiendo...',
  'progress.message.alignPreparing': 'Preparando modelo de alineación...',
  'progress.message.alignDownloading': 'Descargando modelo de alineación...',
  'progress.message.aligning': 'Alineando palabras...',
  'progress.message.aligningWithCount': 'Alineando palabras ({current}/{total})',

  'media.preparing': 'Preparando audio…',
  'media.error': 'No se pudo preparar el audio.',

  'transcript.language': 'Idioma: {language}',
  'transcript.seekHere': 'Ir a esta posición',

  'quant.fp16': 'FP16 (alta calidad original)',
  'quant.fp16Desc': 'Máxima precisión',
  'quant.q5': 'Q5 (cuantizado ligero)',
  'quant.q5Desc': 'Ideal para ahorrar recursos',

  'tooltip.helpLabel': 'Ayuda',

  'settings.title': 'Configuración del sistema',
  'settings.open': 'Configuración del sistema (Ctrl+,)',
  'settings.close': 'Cerrar',
  'settings.transcription': 'Rendimiento de transcripción',
  'settings.concurrency': 'Trabajos simultáneos',
  'settings.threads': 'Hilos de Whisper',
  'settings.threadsAuto': '0 = automático',
  'settings.uiTheme': 'Tema de interfaz',
  'settings.uiTheme.default': 'Predeterminado',
  'settings.uiTheme.doodle': 'Doodle',
  'tooltip.concurrency':
    'Cuántos archivos de la cola se transcriben a la vez. Valores más altos procesan más archivos juntos y son más rápidos, pero usan más GPU y memoria.',
  'tooltip.threads':
    'Número de hilos de CPU de whisper.cpp (n_threads) que usa una sola transcripción. Es distinto de los trabajos simultáneos (concurrencia de archivos) y afecta a la velocidad de inferencia de un archivo. 0 usa un valor predeterminado según los núcleos de tu CPU.',
  'settings.appInfo': 'Información de la aplicación',
  'settings.version': 'Versión actual'
}

const fr: Messages = {
  'tab.transcribe': 'Transcrire',
  'tab.history': 'Bibliothèque',

  'controls.model': 'Modèle',
  'controls.quantization': 'Quantification',
  'controls.language': 'Langue',
  'controls.alignMode': 'Alignement',
  'controls.gpu': 'Accélération GPU',
  'controls.vad': 'Détection vocale VAD',
  'controls.denoise': 'Suppression du bruit et du fond',
  'controls.batchSize': 'Tâches simultanées',
  'controls.recommendedMax': 'Max recommandé : {n}',
  'controls.clearDone': 'Effacer les terminés',
  'controls.cancelAll': 'Tout annuler',
  'controls.running': 'Transcription…',
  'controls.run': 'Démarrer la transcription',
  'controls.runWithCount': 'Démarrer la transcription ({n})',

  'align.none': 'Désactivé',
  'align.wav2vec2': 'wav2vec2 (précis)',
  'align.mms': 'Meta MMS-300M (multilingue)',

  'tooltip.model':
    'Le modèle Whisper utilisé pour la reconnaissance vocale. whisper-large-v3-turbo est recommandé.',
  'tooltip.quantization':
    'Compresse les poids du modèle à une précision plus faible pour améliorer la mémoire et la vitesse. Les niveaux plus élevés sont plus légers mais peuvent légèrement réduire la précision.',
  'tooltip.language':
    "La langue de l'audio. La détection automatique analyse le premier segment pour estimer la langue. Spécifier une langue saute la détection, ce qui est plus rapide et réduit les erreurs.",
  'tooltip.alignMode':
    'Les horodatages par mot sont alignés avec un modèle wav2vec2. Les langues sans modèle pris en charge utilisent des mots approximatifs répartis uniformément dans chaque segment.',
  'tooltip.gpu':
    "Accélère la transcription avec un GPU (CUDA, etc.). Bascule automatiquement sur le CPU si aucun GPU compatible n'est trouvé.",
  'tooltip.vad':
    'La détection d’activité vocale (VAD) ignore les silences et le bruit. Améliore la vitesse et la précision sur les fichiers avec de longs silences.',
  'tooltip.denoise':
    'Réduit le bruit de fond et la musique avant la transcription pour rendre la voix plus claire. Améliore la reconnaissance sur les enregistrements bruyants.',
  'tooltip.batchSize':
    'Combien de fichiers en file transcrire à la fois. Des valeurs plus élevées traitent plus de fichiers ensemble pour plus de vitesse mais utilisent plus de GPU et de mémoire. Dépasser le max recommandé peut provoquer des erreurs de mémoire insuffisante.',

  'hardware.title': '🖥️ Ressources système et spécifications du modèle',
  'hardware.singleReq': 'Ressources estimées (par fichier) :',
  'hardware.totalReq': 'Ressources totales estimées (lot de {n}) :',
  'hardware.freeRam': 'RAM système libre :',
  'hardware.freeVram': 'VRAM GPU libre :',
  'hardware.gpuUnavailable': 'Indisponible ou non accéléré',
  'hardware.warning':
    '⚠️ La taille de lot configurée ({batch}) dépasse la limite recommandée ({max}). Des erreurs de mémoire insuffisante peuvent survenir.',

  'theme.light': 'Clair',
  'theme.dark': 'Sombre',
  'theme.system': 'Système',
  'theme.toggleTitle': 'Changer de thème (clair / sombre / système)',
  'theme.ariaLabel': 'Thème : {label}',

  'locale.label': "Langue d'affichage",
  'locale.ariaLabel': "Choisir la langue d'affichage",

  'dropzone.title': 'Ajouter des fichiers multimédias',
  'dropzone.hint':
    'Glissez des fichiers ici ou cliquez pour sélectionner · plusieurs fichiers pris en charge',

  'language.auto': 'Détection automatique',

  'status.pending': 'En attente',
  'status.running': 'En cours',
  'status.done': 'Terminé',
  'status.error': 'Erreur',
  'status.canceled': 'Annulé',

  'queue.showSubtitle': 'Afficher les sous-titres',
  'queue.hide': 'Masquer',
  'queue.cancel': 'Annuler',
  'queue.removeAria': 'Retirer',
  'queue.error': 'Erreur : {message}',
  'queue.canceled': 'La tâche a été annulée.',

  'export.format': 'Format',
  'export.includeWords': 'Inclure les horodatages par mot',
  'export.run': 'Exporter les sous-titres',
  'export.saved': 'Enregistré : {path}',

  'resplit.maxChars': 'Caractères par ligne',
  'resplit.running': 'Découpage…',
  'resplit.run': 'Redécouper',
  'resplit.hint':
    'Découpe en lignes de type phrase selon le contexte (silence, ponctuation, grammaire)',

  'hotwords.title': 'Dictionnaire de mots-clés',
  'hotwords.tooltip':
    "Les noms propres et le jargon enregistrés sont injectés dans l'initial prompt de Whisper pour améliorer leur reconnaissance.\nAjouter des mots souvent mal reconnus ou des néologismes aide la reconnaissance.\nVous pouvez en ajouter plusieurs à la fois, séparés par des virgules ou des sauts de ligne.",
  'hotwords.hint': 'Correction des noms propres et du jargon ({n})',
  'hotwords.exportTxt': 'Exporter en TXT',
  'hotwords.clear': 'Tout effacer',
  'hotwords.placeholder':
    'Aide à reconnaître les noms et noms propres — tapez un mot et appuyez sur Entrée',
  'hotwords.add': 'Ajouter',
  'hotwords.removeAria': 'Retirer {term}',

  'history.title': 'Bibliothèque',
  'history.refresh': 'Actualiser',
  'history.loading': 'Chargement…',
  'history.empty':
    "Aucune transcription enregistrée pour l'instant. Elles sont enregistrées automatiquement à la fin de la transcription.",
  'history.segments': '{n} segments',
  'history.autoLanguage': 'auto',
  'history.removeAria': 'Supprimer',

  'stage.decode': 'Décodage',
  'stage.transcribe': 'Transcription',
  'stage.align': 'Alignement des mots',
  'stage.export': 'Export',
  'progress.preparing': 'Préparation',
  'progress.elapsed': 'Écoulé {duration}',
  'progress.remaining': 'Environ {duration} restantes',
  'progress.message.decoding': 'Décodage de l’audio...',
  'progress.message.denoisePreparing': 'Préparation du modèle d’amélioration vocale...',
  'progress.message.denoiseDownloading': 'Téléchargement du modèle d’amélioration vocale...',
  'progress.message.denoising': 'Suppression du bruit vocal et de la musique...',
  'progress.message.transcribePreparing': 'Préparation du modèle de transcription...',
  'progress.message.transcribeDownloading': 'Téléchargement du modèle...',
  'progress.message.transcribing': 'Transcription Whisper en cours...',
  'progress.message.alignPreparing': 'Préparation du modèle d’alignement...',
  'progress.message.alignDownloading': 'Téléchargement du modèle d’alignement...',
  'progress.message.aligning': 'Alignement des mots...',
  'progress.message.aligningWithCount': 'Alignement des mots ({current}/{total})',

  'media.preparing': "Préparation de l'audio…",
  'media.error': "Impossible de préparer l'audio.",

  'transcript.language': 'Langue : {language}',
  'transcript.seekHere': 'Aller à cette position',

  'quant.fp16': 'FP16 (haute qualité originale)',
  'quant.fp16Desc': 'Précision maximale',
  'quant.q5': 'Q5 (quantifié léger)',
  'quant.q5Desc': 'Idéal pour économiser les ressources',

  'tooltip.helpLabel': 'Aide',

  'settings.title': 'Paramètres système',
  'settings.open': 'Paramètres système (Ctrl+,)',
  'settings.close': 'Fermer',
  'settings.transcription': 'Performances de transcription',
  'settings.concurrency': 'Tâches simultanées',
  'settings.threads': 'Threads Whisper',
  'settings.threadsAuto': '0 = automatique',
  'settings.uiTheme': "Thème d'interface",
  'settings.uiTheme.default': 'Par défaut',
  'settings.uiTheme.doodle': 'Doodle',
  'tooltip.concurrency':
    'Nombre de fichiers de la file transcrits en même temps. Des valeurs plus élevées traitent plus de fichiers ensemble et sont plus rapides, mais utilisent plus de GPU et de mémoire.',
  'tooltip.threads':
    "Nombre de threads CPU whisper.cpp (n_threads) utilisés par une seule transcription. C'est différent des tâches simultanées (concurrence de fichiers) et cela influe sur la vitesse d'inférence d'un fichier. 0 utilise une valeur par défaut basée sur les cœurs de votre processeur.",
  'settings.appInfo': "Informations sur l'application",
  'settings.version': 'Version actuelle'
}

const de: Messages = {
  'tab.transcribe': 'Transkribieren',
  'tab.history': 'Bibliothek',

  'controls.model': 'Modell',
  'controls.quantization': 'Quantisierung',
  'controls.language': 'Sprache',
  'controls.alignMode': 'Ausrichtung',
  'controls.gpu': 'GPU-Beschleunigung',
  'controls.vad': 'VAD-Spracherkennung',
  'controls.denoise': 'Rausch- und Hintergrundentfernung',
  'controls.batchSize': 'Gleichzeitige Aufgaben',
  'controls.recommendedMax': 'Empfohlenes Maximum: {n}',
  'controls.clearDone': 'Abgeschlossene löschen',
  'controls.cancelAll': 'Alle abbrechen',
  'controls.running': 'Transkribiere…',
  'controls.run': 'Transkription starten',
  'controls.runWithCount': 'Transkription starten ({n})',

  'align.none': 'Deaktiviert',
  'align.wav2vec2': 'wav2vec2 (präzise)',
  'align.mms': 'Meta MMS-300M (multilingual)',

  'tooltip.model':
    'Das für die Spracherkennung verwendete Whisper-Modell. whisper-large-v3-turbo wird empfohlen.',
  'tooltip.quantization':
    'Komprimiert die Modellgewichte auf eine geringere Präzision für besseren Speicherverbrauch und Geschwindigkeit. Höhere Stufen sind leichter, können aber die Genauigkeit leicht verringern.',
  'tooltip.language':
    'Die Sprache des Audios. Die automatische Erkennung analysiert das erste Segment, um die Sprache zu schätzen. Eine angegebene Sprache überspringt die Erkennung, was schneller ist und Fehlerkennungen reduziert.',
  'tooltip.alignMode':
    'Zeitstempel auf Wortebene werden mit einem wav2vec2-Modell ausgerichtet. Sprachen ohne unterstütztes Modell verwenden näherungsweise gleichmäßig über jedes Segment verteilte Wörter.',
  'tooltip.gpu':
    'Beschleunigt die Transkription mit einer GPU (CUDA usw.). Wechselt automatisch zur CPU, wenn keine unterstützte GPU gefunden wird.',
  'tooltip.vad':
    'Die Sprachaktivitätserkennung (VAD) überspringt stille und verrauschte Abschnitte. Verbessert Geschwindigkeit und Genauigkeit bei Dateien mit langen Stillen.',
  'tooltip.denoise':
    'Reduziert Hintergrundrauschen und Musik vor der Transkription, um die Sprache klarer zu machen. Verbessert die Erkennung bei verrauschten Aufnahmen.',
  'tooltip.batchSize':
    'Wie viele Dateien in der Warteschlange gleichzeitig transkribiert werden. Höhere Werte verarbeiten mehr Dateien zusammen für mehr Geschwindigkeit, verbrauchen aber mehr GPU und Speicher. Das Überschreiten des empfohlenen Maximums kann zu Speichermangelfehlern führen.',

  'hardware.title': '🖥️ Systemressourcen & Modellspezifikationen',
  'hardware.singleReq': 'Geschätzte Ressourcen (pro Datei):',
  'hardware.totalReq': 'Geschätzte Gesamtressourcen (Stapel von {n}):',
  'hardware.freeRam': 'Freier System-RAM:',
  'hardware.freeVram': 'Freier GPU-VRAM:',
  'hardware.gpuUnavailable': 'Nicht verfügbar oder nicht beschleunigt',
  'hardware.warning':
    '⚠️ Die konfigurierte Stapelgröße ({batch}) überschreitet das empfohlene Limit ({max}). Es können Speichermangelfehler auftreten.',

  'theme.light': 'Hell',
  'theme.dark': 'Dunkel',
  'theme.system': 'System',
  'theme.toggleTitle': 'Thema wechseln (hell / dunkel / system)',
  'theme.ariaLabel': 'Thema: {label}',

  'locale.label': 'Anzeigesprache',
  'locale.ariaLabel': 'Anzeigesprache auswählen',

  'dropzone.title': 'Mediendateien hinzufügen',
  'dropzone.hint': 'Dateien hierher ziehen oder klicken zum Auswählen · mehrere Dateien möglich',

  'language.auto': 'Automatische Erkennung',

  'status.pending': 'Wartend',
  'status.running': 'Läuft',
  'status.done': 'Fertig',
  'status.error': 'Fehler',
  'status.canceled': 'Abgebrochen',

  'queue.showSubtitle': 'Untertitel anzeigen',
  'queue.hide': 'Ausblenden',
  'queue.cancel': 'Abbrechen',
  'queue.removeAria': 'Entfernen',
  'queue.error': 'Fehler: {message}',
  'queue.canceled': 'Die Aufgabe wurde abgebrochen.',

  'export.format': 'Format',
  'export.includeWords': 'Wort-Zeitstempel einschließen',
  'export.run': 'Untertitel exportieren',
  'export.saved': 'Gespeichert: {path}',

  'resplit.maxChars': 'Zeichen pro Zeile',
  'resplit.running': 'Teile auf…',
  'resplit.run': 'Neu aufteilen',
  'resplit.hint':
    'Teilt anhand des Kontexts (Stille, Satzzeichen, Grammatik) in satzartige Zeilen auf',

  'hotwords.title': 'Hotword-Wörterbuch',
  'hotwords.tooltip':
    'Registrierte Eigennamen und Fachbegriffe werden in Whispers initial prompt eingefügt, um deren Erkennung zu verbessern.\nDas Hinzufügen häufig falsch erkannter Wörter oder Neologismen hilft der Erkennung.\nSie können mehrere auf einmal hinzufügen, getrennt durch Kommas oder Zeilenumbrüche.',
  'hotwords.hint': 'Korrektur von Eigennamen & Fachbegriffen ({n})',
  'hotwords.exportTxt': 'Als TXT exportieren',
  'hotwords.clear': 'Alle löschen',
  'hotwords.placeholder':
    'Hilft, Namen und Eigennamen zu erkennen — Wort eingeben und Enter drücken',
  'hotwords.add': 'Hinzufügen',
  'hotwords.removeAria': '{term} entfernen',

  'history.title': 'Bibliothek',
  'history.refresh': 'Aktualisieren',
  'history.loading': 'Lädt…',
  'history.empty':
    'Noch keine gespeicherten Transkriptionen. Sie werden automatisch gespeichert, wenn die Transkription abgeschlossen ist.',
  'history.segments': '{n} Segmente',
  'history.autoLanguage': 'auto',
  'history.removeAria': 'Löschen',

  'stage.decode': 'Dekodieren',
  'stage.transcribe': 'Transkribieren',
  'stage.align': 'Wortausrichtung',
  'stage.export': 'Export',
  'progress.preparing': 'Vorbereitung',
  'progress.elapsed': 'Vergangen {duration}',
  'progress.remaining': 'Noch etwa {duration}',
  'progress.message.decoding': 'Audio wird dekodiert...',
  'progress.message.denoisePreparing': 'Sprachverbesserungsmodell wird vorbereitet...',
  'progress.message.denoiseDownloading': 'Sprachverbesserungsmodell wird heruntergeladen...',
  'progress.message.denoising': 'Sprachrauschen und Musik werden entfernt...',
  'progress.message.transcribePreparing': 'Transkriptionsmodell wird vorbereitet...',
  'progress.message.transcribeDownloading': 'Modell wird heruntergeladen...',
  'progress.message.transcribing': 'Whisper-Transkription läuft...',
  'progress.message.alignPreparing': 'Ausrichtungsmodell wird vorbereitet...',
  'progress.message.alignDownloading': 'Ausrichtungsmodell wird heruntergeladen...',
  'progress.message.aligning': 'Wörter werden ausgerichtet...',
  'progress.message.aligningWithCount': 'Wörter werden ausgerichtet ({current}/{total})',

  'media.preparing': 'Audio wird vorbereitet…',
  'media.error': 'Audio konnte nicht vorbereitet werden.',

  'transcript.language': 'Sprache: {language}',
  'transcript.seekHere': 'Zu dieser Position springen',

  'quant.fp16': 'FP16 (Original, hohe Qualität)',
  'quant.fp16Desc': 'Höchste Präzision',
  'quant.q5': 'Q5 (quantisiert, leicht)',
  'quant.q5Desc': 'Ideal zum Ressourcensparen',

  'tooltip.helpLabel': 'Hilfe',

  'settings.title': 'Systemeinstellungen',
  'settings.open': 'Systemeinstellungen (Ctrl+,)',
  'settings.close': 'Schließen',
  'settings.transcription': 'Transkriptionsleistung',
  'settings.concurrency': 'Gleichzeitige Aufgaben',
  'settings.threads': 'Whisper-Threads',
  'settings.threadsAuto': '0 = automatisch',
  'settings.uiTheme': 'UI-Thema',
  'settings.uiTheme.default': 'Standard',
  'settings.uiTheme.doodle': 'Doodle',
  'tooltip.concurrency':
    'Wie viele Dateien aus der Warteschlange gleichzeitig transkribiert werden. Höhere Werte verarbeiten mehr Dateien zusammen und sind schneller, verbrauchen aber mehr GPU und Speicher.',
  'tooltip.threads':
    'Anzahl der whisper.cpp-CPU-Threads (n_threads), die eine einzelne Transkription verwendet. Das unterscheidet sich von gleichzeitigen Aufgaben (Datei-Parallelität) und beeinflusst die Inferenzgeschwindigkeit einer Datei. 0 verwendet einen Standardwert basierend auf den CPU-Kernen.',
  'settings.appInfo': 'App-Info',
  'settings.version': 'Aktuelle Version'
}

// 简体中文 (zh-Hans)
const zhHans: Messages = {
  'tab.transcribe': '转写',
  'tab.history': '资料库',

  'controls.model': '模型',
  'controls.quantization': '量化',
  'controls.language': '语言',
  'controls.alignMode': '对齐方式',
  'controls.gpu': 'GPU 加速',
  'controls.vad': 'VAD 语音活动检测',
  'controls.denoise': '降噪与背景音去除',
  'controls.batchSize': '并发任务数',
  'controls.recommendedMax': '推荐上限：{n}',
  'controls.clearDone': '清除已完成',
  'controls.cancelAll': '全部取消',
  'controls.running': '转写中…',
  'controls.run': '开始转写',
  'controls.runWithCount': '开始转写（{n}）',

  'align.none': '不使用',
  'align.wav2vec2': 'wav2vec2（精确）',
  'align.mms': 'Meta MMS-300M（多语言）',

  'tooltip.model': '用于语音识别的 Whisper 模型。推荐使用 whisper-large-v3-turbo。',
  'tooltip.quantization':
    '将模型权重压缩为更低精度，以改善内存占用和速度。级别越高越轻量，但精度可能略有下降。',
  'tooltip.language':
    '音频的语言。自动检测会分析第一段以推断语言。指定语言可跳过检测，更快且能降低误判。',
  'tooltip.alignMode':
    '使用 wav2vec2 模型精确对齐单词级时间戳。没有可用模型的语言会退回到在每个分段内均匀分布的近似单词。',
  'tooltip.gpu': '使用 GPU（CUDA 等）加速转写。若无受支持的 GPU 则自动切换到 CPU。',
  'tooltip.vad': '语音活动检测（VAD）会跳过静音和噪声段。在含长静音的文件上提升速度和精度。',
  'tooltip.denoise': '在转写前减少背景噪声和音乐，使语音更清晰。在嘈杂录音上提升识别率。',
  'tooltip.batchSize':
    '一次并发转写队列中文件的数量。数值越大可一起处理更多文件以提速，但会占用更多 GPU 和内存。超过推荐上限可能导致内存不足。',

  'hardware.title': '🖥️ 系统资源与模型规格',
  'hardware.singleReq': '预计资源（每个文件）：',
  'hardware.totalReq': '总预计资源（批量 {n} 个）：',
  'hardware.freeRam': '可用系统内存：',
  'hardware.freeVram': '可用 GPU 显存：',
  'hardware.gpuUnavailable': '不可用或未加速',
  'hardware.warning': '⚠️ 配置的批量大小（{batch}）超过推荐上限（{max}）。可能发生内存不足错误。',

  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.system': '跟随系统',
  'theme.toggleTitle': '切换主题（浅色 / 深色 / 系统）',
  'theme.ariaLabel': '主题：{label}',

  'locale.label': '显示语言',
  'locale.ariaLabel': '选择显示语言',

  'dropzone.title': '添加媒体文件',
  'dropzone.hint': '将文件拖到此处或点击选择 · 支持同时添加多个',

  'language.auto': '自动检测',

  'status.pending': '等待中',
  'status.running': '处理中',
  'status.done': '完成',
  'status.error': '错误',
  'status.canceled': '已取消',

  'queue.showSubtitle': '查看字幕',
  'queue.hide': '隐藏',
  'queue.cancel': '取消',
  'queue.removeAria': '移除',
  'queue.error': '错误：{message}',
  'queue.canceled': '任务已取消。',

  'export.format': '格式',
  'export.includeWords': '包含单词时间戳',
  'export.run': '导出字幕',
  'export.saved': '已保存：{path}',

  'resplit.maxChars': '每行字符数',
  'resplit.running': '拆分中…',
  'resplit.run': '重新拆分',
  'resplit.hint': '根据上下文（静音、标点、语法）拆分为类似句子的行',

  'hotwords.title': '热词词典',
  'hotwords.tooltip':
    '注册的专有名词和术语会注入 Whisper 的 initial prompt，以提升这些词的识别准确度。\n添加经常被误识别的词或新词有助于识别。\n可用逗号或换行一次添加多个。',
  'hotwords.hint': '专有名词与术语校正（{n}）',
  'hotwords.exportTxt': '导出 TXT',
  'hotwords.clear': '全部清空',
  'hotwords.placeholder': '帮助识别姓名和专有名词 — 输入词语后按回车',
  'hotwords.add': '添加',
  'hotwords.removeAria': '移除 {term}',

  'history.title': '资料库',
  'history.refresh': '刷新',
  'history.loading': '加载中…',
  'history.empty': '尚无保存的转写结果。转写完成后会自动保存。',
  'history.segments': '{n} 个片段',
  'history.autoLanguage': '自动',
  'history.removeAria': '删除',

  'stage.decode': '解码',
  'stage.transcribe': '转写',
  'stage.align': '单词对齐',
  'stage.export': '导出',
  'progress.preparing': '准备中',
  'progress.elapsed': '已用 {duration}',
  'progress.remaining': '剩余约 {duration}',
  'progress.message.decoding': '正在解码音频...',
  'progress.message.denoisePreparing': '正在准备人声增强模型...',
  'progress.message.denoiseDownloading': '正在下载人声增强模型...',
  'progress.message.denoising': '正在消除人声噪音及背景音乐...',
  'progress.message.transcribePreparing': '正在准备转写模型...',
  'progress.message.transcribeDownloading': '正在下载模型...',
  'progress.message.transcribing': 'Whisper 正在转写...',
  'progress.message.alignPreparing': '正在准备对齐模型...',
  'progress.message.alignDownloading': '正在下载对齐模型...',
  'progress.message.aligning': '正在进行单词对齐...',
  'progress.message.aligningWithCount': '正在进行单词对齐 ({current}/{total})',

  'media.preparing': '正在准备音频…',
  'media.error': '无法准备音频。',

  'transcript.language': '语言：{language}',
  'transcript.seekHere': '跳转到此位置',

  'quant.fp16': 'FP16（原始高质量）',
  'quant.fp16Desc': '精度最高',
  'quant.q5': 'Q5（量化轻量）',
  'quant.q5Desc': '最适合节省资源',

  'tooltip.helpLabel': '帮助',

  'settings.title': '系统设置',
  'settings.open': '系统设置 (Ctrl+,)',
  'settings.close': '关闭',
  'settings.transcription': '转录性能',
  'settings.concurrency': '并发任务数',
  'settings.threads': 'Whisper 线程数',
  'settings.threadsAuto': '0 = 自动',
  'settings.uiTheme': 'UI 主题',
  'settings.uiTheme.default': '默认',
  'settings.uiTheme.doodle': '涂鸦',
  'tooltip.concurrency':
    '一次同时转录队列中文件的数量。数值越大，同时处理的文件越多、速度越快，但会占用更多 GPU 和内存。',
  'tooltip.threads':
    '单次转录使用的 whisper.cpp CPU 线程数 (n_threads)。它与并发任务数（文件并发）是不同概念，影响单个文件的推理速度。为 0 时使用基于 CPU 核心数的默认值。',
  'settings.appInfo': '应用信息',
  'settings.version': '当前版本'
}

// 繁體中文 (zh-Hant)
const zhHant: Messages = {
  'tab.transcribe': '轉寫',
  'tab.history': '資料庫',

  'controls.model': '模型',
  'controls.quantization': '量化',
  'controls.language': '語言',
  'controls.alignMode': '對齊方式',
  'controls.gpu': 'GPU 加速',
  'controls.vad': 'VAD 語音活動偵測',
  'controls.denoise': '降噪與背景音去除',
  'controls.batchSize': '並行任務數',
  'controls.recommendedMax': '建議上限：{n}',
  'controls.clearDone': '清除已完成',
  'controls.cancelAll': '全部取消',
  'controls.running': '轉寫中…',
  'controls.run': '開始轉寫',
  'controls.runWithCount': '開始轉寫（{n}）',

  'align.none': '不使用',
  'align.wav2vec2': 'wav2vec2（精確）',
  'align.mms': 'Meta MMS-300M（多語言）',

  'tooltip.model': '用於語音辨識的 Whisper 模型。建議使用 whisper-large-v3-turbo。',
  'tooltip.quantization':
    '將模型權重壓縮為更低精度，以改善記憶體佔用與速度。級別越高越輕量，但精度可能略有下降。',
  'tooltip.language':
    '音訊的語言。自動偵測會分析第一段以推斷語言。指定語言可跳過偵測，更快且能降低誤判。',
  'tooltip.alignMode':
    '使用 wav2vec2 模型精確對齊單詞級時間戳。沒有可用模型的語言會退回到在每個分段內均勻分佈的近似單詞。',
  'tooltip.gpu': '使用 GPU（CUDA 等）加速轉寫。若無支援的 GPU 則自動切換至 CPU。',
  'tooltip.vad': '語音活動偵測（VAD）會略過靜音與雜訊段。在含長靜音的檔案上提升速度與精度。',
  'tooltip.denoise': '在轉寫前減少背景雜訊與音樂，使語音更清晰。在嘈雜錄音上提升辨識率。',
  'tooltip.batchSize':
    '一次並行轉寫佇列中檔案的數量。數值越大可一起處理更多檔案以提速，但會佔用更多 GPU 與記憶體。超過建議上限可能導致記憶體不足。',

  'hardware.title': '🖥️ 系統資源與模型規格',
  'hardware.singleReq': '預估資源（每個檔案）：',
  'hardware.totalReq': '總預估資源（批次 {n} 個）：',
  'hardware.freeRam': '可用系統記憶體：',
  'hardware.freeVram': '可用 GPU 顯示記憶體：',
  'hardware.gpuUnavailable': '無法使用或未加速',
  'hardware.warning': '⚠️ 設定的批次大小（{batch}）超過建議上限（{max}）。可能發生記憶體不足錯誤。',

  'theme.light': '淺色',
  'theme.dark': '深色',
  'theme.system': '跟隨系統',
  'theme.toggleTitle': '切換主題（淺色 / 深色 / 系統）',
  'theme.ariaLabel': '主題：{label}',

  'locale.label': '顯示語言',
  'locale.ariaLabel': '選擇顯示語言',

  'dropzone.title': '新增媒體檔案',
  'dropzone.hint': '將檔案拖曳至此處或點擊選擇 · 支援同時新增多個',

  'language.auto': '自動偵測',

  'status.pending': '等待中',
  'status.running': '處理中',
  'status.done': '完成',
  'status.error': '錯誤',
  'status.canceled': '已取消',

  'queue.showSubtitle': '檢視字幕',
  'queue.hide': '隱藏',
  'queue.cancel': '取消',
  'queue.removeAria': '移除',
  'queue.error': '錯誤：{message}',
  'queue.canceled': '工作已取消。',

  'export.format': '格式',
  'export.includeWords': '包含單詞時間戳',
  'export.run': '匯出字幕',
  'export.saved': '已儲存：{path}',

  'resplit.maxChars': '每行字元數',
  'resplit.running': '拆分中…',
  'resplit.run': '重新拆分',
  'resplit.hint': '根據上下文（靜音、標點、文法）拆分為類似句子的行',

  'hotwords.title': '熱詞詞典',
  'hotwords.tooltip':
    '註冊的專有名詞與術語會注入 Whisper 的 initial prompt，以提升這些詞的辨識準確度。\n新增經常被誤辨識的詞或新詞有助於辨識。\n可用逗號或換行一次新增多個。',
  'hotwords.hint': '專有名詞與術語校正（{n}）',
  'hotwords.exportTxt': '匯出 TXT',
  'hotwords.clear': '全部清空',
  'hotwords.placeholder': '協助辨識姓名與專有名詞 — 輸入詞語後按 Enter',
  'hotwords.add': '新增',
  'hotwords.removeAria': '移除 {term}',

  'history.title': '資料庫',
  'history.refresh': '重新整理',
  'history.loading': '載入中…',
  'history.empty': '尚無儲存的轉寫結果。轉寫完成後會自動儲存。',
  'history.segments': '{n} 個片段',
  'history.autoLanguage': '自動',
  'history.removeAria': '刪除',

  'stage.decode': '解碼',
  'stage.transcribe': '轉寫',
  'stage.align': '單詞對齊',
  'stage.export': '匯出',
  'progress.preparing': '準備中',
  'progress.elapsed': '已用 {duration}',
  'progress.remaining': '剩餘約 {duration}',
  'progress.message.decoding': '正在解碼音訊...',
  'progress.message.denoisePreparing': '正在準備人聲增強模型...',
  'progress.message.denoiseDownloading': '正在下載人聲增強模型...',
  'progress.message.denoising': '正在消除人聲噪音及背景音樂...',
  'progress.message.transcribePreparing': '正在準備轉寫模型...',
  'progress.message.transcribeDownloading': '正在下載模型...',
  'progress.message.transcribing': 'Whisper 正在轉寫...',
  'progress.message.alignPreparing': '正在準備對齊模型...',
  'progress.message.alignDownloading': '正在下載對齊模型...',
  'progress.message.aligning': '正在進行單詞對齊...',
  'progress.message.aligningWithCount': '正在進行單詞對齊 ({current}/{total})',

  'media.preparing': '正在準備音訊…',
  'media.error': '無法準備音訊。',

  'transcript.language': '語言：{language}',
  'transcript.seekHere': '跳至此位置',

  'quant.fp16': 'FP16（原始高品質）',
  'quant.fp16Desc': '精度最高',
  'quant.q5': 'Q5（量化輕量）',
  'quant.q5Desc': '最適合節省資源',

  'tooltip.helpLabel': '說明',

  'settings.title': '系統設定',
  'settings.open': '系統設定 (Ctrl+,)',
  'settings.close': '關閉',
  'settings.transcription': '轉錄效能',
  'settings.concurrency': '並行任務數',
  'settings.threads': 'Whisper 執行緒數',
  'settings.threadsAuto': '0 = 自動',
  'settings.uiTheme': 'UI 主題',
  'settings.uiTheme.default': '預設',
  'settings.uiTheme.doodle': '塗鴉',
  'tooltip.concurrency':
    '一次同時轉錄佇列中檔案的數量。數值越大，同時處理的檔案越多、速度越快，但會佔用更多 GPU 和記憶體。',
  'tooltip.threads':
    '單次轉錄使用的 whisper.cpp CPU 執行緒數 (n_threads)。它與並行任務數（檔案並行）是不同概念，會影響單一檔案的推論速度。為 0 時使用依 CPU 核心數而定的預設值。',
  'settings.appInfo': '應用程式資訊',
  'settings.version': '目前版本'
}

export const translations: Record<UiLocale, Messages> = {
  ko,
  en,
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  es,
  fr,
  de
}
