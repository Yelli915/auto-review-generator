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

// 예전에 설치된 서비스 워커와 캐시를 정리합니다. 기존 사용자가 한 번씩 방문한 뒤에는 지워도 됩니다.
navigator.serviceWorker?.getRegistrations().then((registrations) => {
  registrations.forEach((registration) => registration.unregister())
})
globalThis.caches?.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
