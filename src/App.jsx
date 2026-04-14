import { useEffect, useMemo, useState } from 'react'
import { GoogleLogin, googleLogout } from '@react-oauth/google'
import ReviewGenerator from './components/ReviewGenerator/ReviewGenerator'
import {
  setGoogleIdToken,
  setUnauthorizedHandler,
} from './components/ReviewGenerator/api/geminiService'

const AUTH_STORAGE_KEY = 'autoReviewGoogleIdToken'

function getEnvGoogleClientId() {
  if (
    typeof import.meta === 'undefined' ||
    !import.meta.env ||
    typeof import.meta.env.VITE_GOOGLE_CLIENT_ID !== 'string'
  ) {
    return ''
  }
  return import.meta.env.VITE_GOOGLE_CLIENT_ID.trim()
}

function App() {
  const [token, setToken] = useState('')
  const [authError, setAuthError] = useState('')
  const googleClientId = useMemo(getEnvGoogleClientId, [])

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(AUTH_STORAGE_KEY) || ''
      const normalized = saved.trim()
      if (normalized) {
        setToken(normalized)
        setGoogleIdToken(normalized)
      }
    } catch {
      void 0
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken('')
      setGoogleIdToken('')
      setAuthError('로그인이 만료되었습니다. 다시 로그인해 주세요.')
      try {
        window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
      } catch {
        void 0
      }
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const handleLoginSuccess = (credentialResponse) => {
    const credential =
      typeof credentialResponse?.credential === 'string'
        ? credentialResponse.credential.trim()
        : ''
    if (!credential) {
      setAuthError('로그인 토큰을 받지 못했습니다. 다시 시도해 주세요.')
      return
    }
    setAuthError('')
    setToken(credential)
    setGoogleIdToken(credential)
    try {
      window.sessionStorage.setItem(AUTH_STORAGE_KEY, credential)
    } catch {
      void 0
    }
  }

  const handleLogout = () => {
    googleLogout()
    setToken('')
    setGoogleIdToken('')
    try {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {
      void 0
    }
  }

  if (!googleClientId) {
    return (
      <main className="review-app">
        <div className="banner banner--error" role="alert">
          VITE_GOOGLE_CLIENT_ID가 설정되지 않았습니다.
        </div>
      </main>
    )
  }

  if (!token) {
    return (
      <main className="review-app">
        <header className="review-app__header">
          <h1 className="review-app__title">Auto Review</h1>
          <p className="review-app__tagline">Google 로그인 후 이용할 수 있습니다.</p>
        </header>
        {authError && (
          <div className="banner banner--error" role="alert">
            {authError}
          </div>
        )}
        <GoogleLogin
          onSuccess={handleLoginSuccess}
          onError={() => setAuthError('Google 로그인에 실패했습니다.')}
          useOneTap
        />
      </main>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px' }}>
        <button type="button" onClick={handleLogout}>
          로그아웃
        </button>
      </div>
      <ReviewGenerator />
    </>
  )
}

export default App
