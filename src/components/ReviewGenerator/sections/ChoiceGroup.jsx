import { useId } from 'react'

// 네이티브 라디오로 만든 선택 그룹입니다. 키보드 화살표 이동과 스크린리더 안내를 브라우저가 처리합니다.
export default function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
  disabled,
  variant = 'segmented',
  hint,
}) {
  const name = useId()
  return (
    <fieldset className="choice-group" disabled={disabled}>
      <legend className="field__label">{legend}</legend>
      <div className={`choice-group__options choice-group__options--${variant}`}>
        {options.map((option) => (
          <label key={option.value} className="choice">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="choice__label">{option.label}</span>
          </label>
        ))}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </fieldset>
  )
}
