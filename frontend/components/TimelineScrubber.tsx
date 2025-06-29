"use client"

import { useState, useEffect, useRef } from "react"
import { useThumbnails } from "@/hooks/useThumbnails"
import { cn } from "@/lib/utils"

interface TimelineScrubberProps {
  value: number[]
  onValueChange: (value: number[]) => void
  max: number
  videoElement: HTMLVideoElement | null
  className?: string
  step?: number
  disabled?: boolean
}

export function TimelineScrubber({
  value,
  onValueChange,
  max,
  videoElement,
  className,
  step = 1,
  disabled = false,
}: TimelineScrubberProps) {
  const duration = videoElement?.duration || 0
  const { thumbnails, isGenerating } = useThumbnails(videoElement, duration, 10)
  const [isHovering, setIsHovering] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  // Calculate current position percentage
  const currentPosition = max > 0 ? (value[0] / max) * 100 : 0

  // Handle hover preview
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || !videoElement) return
    
    const rect = trackRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    const time = (percentage / 100) * duration
    
    setHoverTime(time)
  }

  const handleMouseEnter = () => setIsHovering(true)
  const handleMouseLeave = () => {
    setIsHovering(false)
    setHoverTime(null)
  }

  // Handle direct clicks on the timeline
  const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || disabled) return
    
    const rect = trackRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    const newValue = Math.round((percentage / 100) * max)
    
    onValueChange([newValue])
  }

  // Handle dragging on the timeline
  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    
    event.preventDefault()
    
    const handleMouseMoveGlobal = (e: MouseEvent) => {
      if (!trackRef.current) return
      
      const rect = trackRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
      const newValue = Math.round((percentage / 100) * max)
      
      onValueChange([newValue])
    }
    
    const handleMouseUpGlobal = () => {
      document.removeEventListener('mousemove', handleMouseMoveGlobal)
      document.removeEventListener('mouseup', handleMouseUpGlobal)
    }
    
    document.addEventListener('mousemove', handleMouseMoveGlobal)
    document.addEventListener('mouseup', handleMouseUpGlobal)
    
    // Trigger initial change
    handleTrackClick(event)
  }

  return (
    <div className={cn("relative w-full", className)}>
      {/* Thumbnail Track Background */}
      <div
        ref={trackRef}
        className="relative h-12 mb-2 rounded-md overflow-hidden bg-gray-900 border border-gray-700"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Loading State */}
        {isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 z-10">
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              <span>Generating timeline...</span>
            </div>
          </div>
        )}

        {/* Thumbnails */}
        {thumbnails.length > 0 && (
          <div className="flex h-full">
            {thumbnails.map((thumbnail, index) => (
              <div
                key={index}
                className="flex-1 h-full relative group"
                style={{ 
                  minWidth: `${100 / thumbnails.length}%`,
                  maxWidth: `${100 / thumbnails.length}%` 
                }}
              >
                <img
                  src={thumbnail.src}
                  alt={`Frame at ${thumbnail.time.toFixed(1)}s`}
                  className="w-full h-full object-cover"
                  style={{ 
                    borderRight: index < thumbnails.length - 1 ? '1px solid #374151' : 'none' 
                  }}
                />
                
                {/* Hover overlay with time */}
                {isHovering && (
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Fallback pattern when no thumbnails */}
        {thumbnails.length === 0 && !isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-xs text-gray-500">No preview available</div>
          </div>
        )}

        {/* Playhead Position Indicator */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-blue-500 shadow-lg z-20 transition-all duration-75"
          style={{ left: `${currentPosition}%` }}
        >
          {/* Playhead handle */}
          <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full shadow-md" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 rounded-full shadow-md" />
        </div>

        {/* Hover Time Tooltip */}
        {isHovering && hoverTime !== null && (
          <div
            className="absolute -top-8 transform -translate-x-1/2 z-30 pointer-events-none"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          >
            <div className="bg-black text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
              {formatTime(hoverTime)}
            </div>
          </div>
        )}

        {/* Interactive Click Handler */}
        <div 
          className="absolute inset-0 cursor-pointer z-10"
          onClick={handleTrackClick}
          onMouseDown={handleMouseDown}
        />
      </div>

      {/* Time Labels at 20% intervals */}
      <div className="flex justify-between mt-2 px-1">
        {[0, 20, 40, 60, 80, 100].map((percentage) => {
          const time = (percentage / 100) * duration
          return (
            <div 
              key={percentage}
              className="text-xs text-gray-500 font-mono"
            >
              {formatTime(time)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Format time in MM:SS format
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
} 