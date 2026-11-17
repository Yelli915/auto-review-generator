import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import './styles/review-layout.css'
import './styles/upload.css'
import './styles/keyword-review.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 예전에 설치된 서비스 워커와 캐시를 정리합니다. 기존 사용자가 한 번씩 방문한 뒤에는 지워도 됩니다.
navigator.serviceWorker?.getRegistrations().then((registrations) => {
  registrations.forEach((registration) => registration.unregister())
})
globalThis.caches?.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
