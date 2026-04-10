import { useState } from 'react'
import ReviewGenerator from './components/ReviewGenerator/ReviewGenerator'
import {
  pingGemini,
  generateKeywords,
} from './components/ReviewGenerator/api/geminiService'

function ApiTest() {
  const [msg, setMsg] = useState('')

  async function handleClick() {
    setMsg('요청 중…')
    const r = await pingGemini()
    if (r.ok) {
      setMsg('연결 OK')
    } else {
      setMsg(r.error)
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick}>
        Gemini 연결 테스트
      </button>
      <p>{msg}</p>
    </>
  )
}

function App() {
  const [imageBase64, setImageBase64] = useState('')
  const [keywordMsg, setKeywordMsg] = useState('')

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (!file) {
      setImageBase64('')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      const commaIndex = dataUrl.indexOf(',')
      const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : ''
      setImageBase64(base64)
      setKeywordMsg(base64 ? '이미지 준비 완료' : '이미지 변환 실패')
    }
    reader.onerror = () => {
      setImageBase64('')
      setKeywordMsg('이미지 변환 실패')
    }
    reader.readAsDataURL(file)
  }

  async function handleKeywordTest() {
    if (!imageBase64) {
      setKeywordMsg('이미지를 먼저 선택하세요')
      return
    }

    setKeywordMsg('키워드 요청 중…')
    const r = await generateKeywords({
      imageBase64,
      rating: 5,
      mimeType: 'image/jpeg',
    })
    console.log(r.ok, r.keywords?.length, r.keywords)
    if (!r.ok) console.log('rawText:', r.rawText)
    setKeywordMsg(r.ok ? '콘솔 확인: 키워드 결과 출력됨' : r.error)
  }

  return (
    <>
      <div>
        <input type="file" accept="image/*" onChange={handleImageChange} />
        <button type="button" onClick={handleKeywordTest} disabled={!imageBase64}>
          키워드 생성 콘솔 테스트
        </button>
        <p>{keywordMsg}</p>
      </div>
      <ApiTest />
      <ReviewGenerator />
    </>
  )
}

export default App
