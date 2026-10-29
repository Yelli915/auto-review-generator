import ReviewGenerator from './components/ReviewGenerator/ReviewGenerator'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">Auto Review</span>
          <span className="app-header__tagline">사진 한 장으로 리뷰 초안까지</span>
        </div>
      </header>

      <ReviewGenerator />
    </div>
  )
}

export default App
