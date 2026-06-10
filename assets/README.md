# CaptionX 에셋 및 리소스 보관 가이드

이 디렉토리는 **CaptionX** 프로젝트에서 사용하는 로고, 아이콘, 그래픽 에셋의 원본 자료와 가이드라인을 보관하기 위해 생성되었습니다. 목적에 따라 에셋을 보관하는 최적의 위치가 다르므로 아래 가이드를 참고하여 보관해 주세요.

---

## 1. 디자인 원본 자료 (Raw Design Sources)

- **보관 경로**: `assets/` (현재 디렉토리)
- **대상 파일**: Figma 내보내기 파일(`.fig`), Illustrator(`.ai`), Photoshop(`.psd`), 고해상도 원본 이미지, 로고 가이드라인 문서 등
- **목적**: 개발에 직접 쓰이진 않으나 디자인 히스토리 보존 및 수정을 위한 원본 백업
- **하위 구조 제안**:
  ```text
  assets/
  ├── logo/          # 서비스 공식 로고 (가로형, 세로형, 심볼형 원본)
  ├── icons/         # UI 아이콘 리소스 원본
  └── banner/        # 스토어 등록 및 홍보용 배너/스크린샷 원본
  ```
  > [!TIP]
  > 원본 에셋 중 용량이 매우 큰 파일(예: 수백 MB 대의 PSD나 AI 파일)이 추가될 경우, Git 리포지토리의 용량이 비대해질 수 있으므로 LFS(Git Large File Storage)를 설정하거나 클라우드 저장소 링크로 대체하는 것을 권장합니다.

---

## 2. OS 빌드 및 패키징용 에셋 (App Icons)

- **보관 경로**: `build/` 및 `resources/`
- **대상 파일**:
  - Windows: `build/icon.ico` (256x256 이상 멀티 아이콘)
  - Linux/Universal: `resources/icon.png` (512x512)
- **목적**: `tauri.conf.json`의 `bundle > icon` 설정에 따라 데스크톱 애플리케이션의 설치 프로그램 및 실행 파일 아이콘으로 빌드하기 위함

---

## 3. 웹/UI 렌더러 번들링용 에셋 (UI Assets)

- **보관 경로**: `src/assets/`
- **대상 파일**: UI 컴포넌트 내부에서 직접 불러와 렌더링할 로고 PNG, 인앱 일러스트 등
- **사용 예시**:

  ```tsx
  import logo from './assets/logo.png'

  function Header() {
    return <img src={logo} alt="CaptionX Logo" className="w-8 h-8" />
  }
  ```

- **목적**: Vite 번들러가 빌드 과정에서 최적화, 해싱, 번들링을 수행할 수 있도록 소스 코드 영역에 포함

---

## 4. 런타임 동적 로드용 에셋 (Runtime Resources)

- **보관 경로**: `resources/`
- **대상 파일**: 앱이 로컬에서 실행되는 동안 Rust 백엔드(`src-tauri/src`)에서 물리적 파일 경로를 통해 직접 접근해야 하는 리소스 (예: ONNX 모델 파일)
- **목적**: `tauri.conf.json`에서 `bundle > resources`에 지정되어 배포 패키지 내부에 포함됨
