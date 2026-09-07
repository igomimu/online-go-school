import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { initTheme } from './utils/theme'

// 画面が出る前にテーマを確定させる（描画後だと一瞬ちらつく）
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// 🔴 更新を掴んでも、ここでは読み込み直さない（registerType: 'prompt'）。
// 授業中の端末を勝手に再読み込みすると教室との接続が切れる（2026-09-07）。
// 読み込み直すかどうかは App が決める（utils/appUpdatePolicy.ts）。
// 60秒ごとの update() は、新しい版を早く掴むためだけのもの。
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => {
      registration.update().catch(() => {})
    }, 60 * 1000)
  },
})

void updateSW
