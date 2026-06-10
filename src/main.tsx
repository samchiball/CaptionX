import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LocaleProvider } from './i18n'
import './styles.css'

// 드롭존 밖에 파일을 떨어뜨려도 창이 해당 파일로 이동하지 않도록 전역 차단
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>
)
