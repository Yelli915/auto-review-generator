import { useEffect, useMemo, useRef, useState } from 'react'
import { GoogleLogin, googleLogout } from '@react-oauth/google'
import ReviewGenerator from './components/ReviewGenerator/ReviewGenerator'
import {
  setGoogleIdToken,
  setUnauthorizedHandler,
} from './components/ReviewGenerator/api/geminiService'
import { getGoogleClientId } from './utils/env'

function App() {
  const [token, setToken] = useState('')
  const [authError, setAuthError] = useState('')
  const [isFlowOpen, setIsFlowOpen] = useState(true)
  const [flowMaxHeight, setFlowMaxHeight] = useState('0px')
  const googleClientId = useMemo(() => getGoogleClientId(), [])
  const flowContentRef = useRef(null)

  useEffect(() => {
    setGoogleIdToken(token)
  }, [token])

  useEffect(() => {
    const content = flowContentRef.current
    if (!content) return
    setFlowMaxHeight(isFlowOpen ? `${content.scrollHeight}px` : '0px')
  }, [isFlowOpen])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken('')
      setAuthError('로그인이 만료되었습니다. 다시 로그인해 주세요.')
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
  }

  const handleLogout = () => {
    googleLogout()
    setToken('')
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
        <main className="auth-layout auth-layout--single">
          <section className="auth-intro auth-intro--with-login">
            <p className="auth-intro__eyebrow">리뷰 작성 자동화</p>
            <h1 className="auth-intro__title">사진 한 장으로 리뷰 초안까지</h1>
            <p className="auth-intro__text">
              업로드부터 복사까지, 3단계로 빠르게 끝냅니다.
            </p>
            <div className="auth-intro__login">
              {authError && (
                <div className="banner banner--error" role="alert">
                  {authError}
                </div>
              )}
              <div className="auth-card__login">
                <GoogleLogin
                  onSuccess={handleLoginSuccess}
                  onError={() => setAuthError('Google 로그인에 실패했습니다.')}
                  auto_select={false}
                  shape="pill"
                />
              </div>
            </div>
            <details className="auth-intro__flow-wrap" open={isFlowOpen}>
              <summary
                onClick={(e) => {
                  e.preventDefault()
                  setIsFlowOpen((prev) => !prev)
                }}
              >
                사용 흐름 보기
              </summary>
              <div
                ref={(node) => {
                  flowContentRef.current = node
                }}
                className="auth-intro__flow-panel"
                style={{ maxHeight: flowMaxHeight }}
              >
                <ol className="auth-intro__flow">
                  <li>이미지와 별점 입력</li>
                  <li>키워드/길이/말투 선택</li>
                  <li>리뷰 생성 후 복사</li>
                </ol>
              </div>
            </details>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell app-shell--authed">
      <button type="button" className="btn btn--secondary app-logout-floating" onClick={handleLogout}>
        로그아웃
      </button>
      <ReviewGenerator />
    </div>
  )
}

export default App
