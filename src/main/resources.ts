import { join } from 'node:path'
import { app } from 'electron'

/**
 * 앱에 번들된 정적 리소스 경로를 반환한다.
 *
 * 개발 모드: 프로젝트 루트/resources
 * 패키징 후: process.resourcesPath/resources
 *
 * ONNX 같은 네이티브 런타임 입력은 asar 내부 경로를 직접 열지 못할 수 있으므로,
 * electron-builder의 extraResources로 풀린 실제 파일 경로를 사용한다.
 */
export function resolveBundledResource(name: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', name)
  }
  return join(app.getAppPath(), 'resources', name)
}
