import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleLogin, googleLogout } from '@react-oauth/google'
import ReviewGenerator from './components/ReviewGenerator/ReviewGenerator'
import {
  setGoogleIdToken,
  setUnauthorizedHandler,
} from './components/ReviewGenerator/services/geminiService'
import { getGoogleClientId } from './utils/env'

function readTokenName(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes))
    return claims.name || claims.email || 'Google 계정'
  } catch {
    return 'Google 계정'
  }
}

function LoginDialog({ open, error, onSuccess, onError, onCancel }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="login-dialog"
      aria-labelledby="login-dialog-title"
      onClose={onCancel}
    >
      <h2 className="login-dialog__title" id="login-dialog-title">
        Google 계정으로 계속하기
      </h2>
      <p className="login-dialog__text">
        키워드와 리뷰 생성은 로그인한 사용자만 사용할 수 있습니다. 입력한 내용은 그대로 유지됩니다.
      </p>
      {error && <p className="banner banner--error" role="alert">{error}</p>}
      <div className="login-dialog__button">
        {open && (
          <GoogleLogin
            onSuccess={onSuccess}
            onError={onError}
            auto_select={false}
            shape="pill"
            width={240}
          />
        )}
      </div>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>
        취소
      </button>
    </dialog>
  )
}

function App() {
  const [token, setToken] = useState('')
  const [authError, setAuthError] = useState('')
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const loginRef = useRef(null)
  const googleClientId = getGoogleClientId()

  const updateToken = (value) => {
    setGoogleIdToken(value)
    setToken(value)
  }

  // 로그인이 필요한 순간에 창을 띄우고, 로그인 성공 여부를 Promise로 돌려줍니다.
  const requestLogin = useCallback(() => {
    if (!loginRef.current) {
      let resolve
      const promise = new Promise((r) => { resolve = r })
      loginRef.current = { promise, resolve }
    }
    setIsLoginOpen(true)
    return loginRef.current.promise
  }, [])

  const finishLogin = (ok) => {
    loginRef.current?.resolve(ok)
    loginRef.current = null
    setIsLoginOpen(false)
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setGoogleIdToken('')
      setToken('')
      setAuthError('로그인이 만료되었습니다. 다시 시도하면 로그인 창이 열립니다.')
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
    updateToken(credential)
    finishLogin(true)
  }

  const handleLogout = () => {
    googleLogout()
    updateToken('')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">Auto Review</span>
          <span className="app-header__tagline">사진 한 장으로 리뷰 초안까지</span>
        </div>
        {googleClientId && (
          <div className="app-header__account">
            {token ? (
              <>
                <span className="app-header__user">{readTokenName(token)}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={handleLogout}>
                  로그아웃
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--secondary btn--sm" onClick={requestLogin}>
                로그인
              </button>
            )}
          </div>
        )}
      </header>

      {!googleClientId && (
        <div className="banner banner--error app-banner" role="alert">
          VITE_GOOGLE_CLIENT_ID가 설정되지 않아 로그인할 수 없습니다. 환경 변수를 확인해 주세요.
        </div>
      )}
      {authError && !isLoginOpen && (
        <div className="banner banner--error app-banner" role="alert">{authError}</div>
      )}

      <ReviewGenerator requestLogin={googleClientId ? requestLogin : undefined} />

      {googleClientId && (
        <LoginDialog
          open={isLoginOpen}
          error={authError}
          onSuccess={handleLoginSuccess}
          onError={() => setAuthError('Google 로그인에 실패했습니다.')}
          onCancel={() => finishLogin(false)}
        />
      )}
    </div>
  )
}

export default App
