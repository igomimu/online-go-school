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

// SW更新時のリロードは index.html の controllerchange ハンドラが一元管理
// （初回インストールの claim ではリロードしないガード付き）
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
