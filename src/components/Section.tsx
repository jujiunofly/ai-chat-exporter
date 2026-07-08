import React from 'react'

interface SectionProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function Section({ title, children, className = '' }: SectionProps) {
  return (
    <div className={`flex-col gap-2 ${className}`}>
      <h3 className="section-label uppercase tracking-wider text-xs font-bold text-muted border-b border-light pb-1 mb-1">
        {title}
      </h3>
      <div className="flex-col gap-1">
        {children}
      </div>
    </div>
  )
}

export default Section
