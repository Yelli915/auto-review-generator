import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'
import { getGoogleClientId } from './utils/env'

const googleClientId = getGoogleClientId()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)

// dev에서는 등록하지 않습니다. 캐시가 Vite 개발 모듈을 붙잡아 서버 재시작 후 빈 화면이 됩니다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA install remains optional; the app should still run if registration fails.
    })
  })
}
