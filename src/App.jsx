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
  const [token, setToken] = useState(() => {
    try {
      return (window.sessionStorage.getItem(AUTH_STORAGE_KEY) || '').trim()
    } catch {
      return ''
    }
  })
  const [authError, setAuthError] = useState('')
  const googleClientId = useMemo(() => getEnvGoogleClientId(), [])

  useEffect(() => {
    setGoogleIdToken(token)
  }, [token])

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
      <div className="app-shell">
        <main className="auth-layout">
          <section className="auth-card">
            <h1 className="auth-card__title">Auto Review</h1>
            <p className="auth-card__text">
              실행 전 환경 변수 확인이 필요합니다.
            </p>
            <div className="banner banner--error" role="alert">
              VITE_GOOGLE_CLIENT_ID가 설정되지 않았습니다.
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="app-shell">
        <main className="auth-layout">
          <section className="auth-intro">
            <p className="auth-intro__eyebrow">리뷰 작성 자동화</p>
            <h1 className="auth-intro__title">사진 한 장으로 리뷰 초안까지</h1>
            <p className="auth-intro__text">
              업로드부터 복사까지, 3단계로 빠르게 끝냅니다.
            </p>
            <details className="auth-intro__flow-wrap" open>
              <summary>사용 흐름 보기</summary>
              <ol className="auth-intro__flow">
                <li>이미지와 별점 입력</li>
                <li>키워드/길이/말투 선택</li>
                <li>리뷰 생성 후 복사</li>
              </ol>
            </details>
          </section>

          <section className="auth-card">
            <h2 className="auth-card__title">Google 로그인</h2>
            <p className="auth-card__text">
              로그인 후 리뷰 생성 기능을 사용할 수 있습니다.
            </p>
            {authError && (
              <div className="banner banner--error" role="alert">
                {authError}
              </div>
            )}
            <div className="auth-card__login">
              <GoogleLogin
                onSuccess={handleLoginSuccess}
                onError={() => setAuthError('Google 로그인에 실패했습니다.')}
                useOneTap
              />
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div>
          <p className="app-topbar__brand">Auto Review</p>
          <p className="app-topbar__sub">입력부터 생성까지 한 번에</p>
        </div>
        <button type="button" className="btn btn--secondary app-topbar__logout" onClick={handleLogout}>
          로그아웃
        </button>
      </header>
      <ReviewGenerator />
    </div>
  )
}

export default App
