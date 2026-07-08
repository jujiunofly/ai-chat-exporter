import React from 'react'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id
}: ToggleProps) {
  const toggleId = id || `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className={`options-row flex items-center justify-between py-2 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-col pr-4 flex-1">
        <label htmlFor={toggleId} className="option-label text-sm font-medium cursor-pointer">
          {label}
        </label>
        {description && (
          <span className="option-description text-xs text-muted mt-half">
            {description}
          </span>
        )}
      </div>
      <input
        type="checkbox"
        id={toggleId}
        className="toggle"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
      />
    </div>
  )
}

export default Toggle
