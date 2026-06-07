import { useState } from 'react'

export default function StarRating({ value, onChange, disabled, ratingLabels }) {
  const [hovered, setHovered] = useState(null)
  const display = hovered ?? value

  return (
    <div
      className="star-rating"
      role="group"
      aria-label="별점 선택"
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star${display >= star ? ' star--on' : ''}`}
          onMouseEnter={() => !disabled && setHovered(star)}
          onClick={() => !disabled && onChange(star)}
          aria-label={`${star}점`}
          aria-pressed={value === star}
          tabIndex={disabled ? -1 : 0}
        >
          ★
        </button>
      ))}
      <span className="star-rating__label">
        {display}점 · {ratingLabels[display]}
      </span>
    </div>
  )
}
