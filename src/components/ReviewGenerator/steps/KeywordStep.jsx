import { useState } from 'react'

export default function KeywordStep({ keywords, onNext, onRefresh, isLoading }) {
  const [selected, setSelected] = useState([])

  const toggleKeyword = (keyword) => {
    setSelected((prev) =>
      prev.includes(keyword)
        ? prev.filter((k) => k !== keyword)
        : [...prev, keyword],
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '24px',
        }}
      >
        {keywords.map((keyword) => (
          <button
            key={keyword}
            onClick={() => toggleKeyword(keyword)}
            style={{
              padding: '10px 16px',
              minHeight: '48px',
              borderRadius: '24px',
              border: selected.includes(keyword)
                ? '2px solid #333'
                : '1px solid #ccc',
              fontWeight: selected.includes(keyword) ? 'bold' : 'normal',
              cursor: 'pointer',
              background: selected.includes(keyword) ? '#f0f0f0' : 'white',
            }}
          >
            {keyword}
          </button>
        ))}
      </div>

      <button
        onClick={onRefresh}
        disabled={isLoading}
        style={{ width: '100%', height: '48px', marginBottom: '12px' }}
      >
        {isLoading ? '생성 중...' : '키워드 다시 생성'}
      </button>

      <button
        onClick={() => onNext(selected)}
        disabled={selected.length === 0}
        style={{ width: '100%', height: '52px', fontSize: '16px' }}
      >
        리뷰 작성
      </button>
    </div>
  )
}
