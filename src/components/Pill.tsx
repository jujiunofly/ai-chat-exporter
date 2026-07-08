import React from 'react'

interface PillProps {
  label: string
  platform: 'chatgpt' | 'gemini' | 'claude' | 'deepseek' | 'grok' | string
  icon?: React.ReactNode
  className?: string
}

export function Pill({ label, platform, icon, className = '' }: PillProps) {
  return (
    <div className={`badge ${platform} ${className}`}>
      {icon}
      <span>{label}</span>
    </div>
  )
}

export default Pill
