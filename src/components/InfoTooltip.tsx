/**
 * InfoTooltip Component
 * A small ⓘ button that reveals explanatory copy on hover or keyboard focus,
 * keeping secondary guidance off the page until it is asked for.
 */

import { useId } from 'react'
import { InfoIcon } from './icons'

interface InfoTooltipProps {
  /** Explanation shown inside the bubble. */
  text: string
  /** Accessible name for the trigger button. */
  label?: string
}

export function InfoTooltip({ text, label = 'More info' }: InfoTooltipProps) {
  const bubbleId = useId()

  return (
    <span className="info-tooltip">
      <button
        type="button"
        className="info-tooltip-trigger"
        aria-label={label}
        aria-describedby={bubbleId}
      >
        <InfoIcon size={13} />
      </button>
      <span className="info-tooltip-bubble" role="tooltip" id={bubbleId}>
        {text}
      </span>
    </span>
  )
}
