"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Card } from "@/components/ui/card"
import { Play, Pause, SkipBack, SkipForward, Timer } from "lucide-react"
import type { AnnotationData } from "@/lib/types"

interface VideoPlayerProps {
  onVideoRef: (video: HTMLVideoElement | null) => void
  onFrameChange: (frame: number) => void
  onPlayStateChange: (isPlaying: boolean) => void
  annotationData: AnnotationData | null
}

export default function VideoPlayer({
  onVideoRef,
  onFrameChange,
  onPlayStateChange,
  annotationData,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameByFrameIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isFrameByFrameMode, setIsFrameByFrameMode] = useState(false)

  const fps = annotationData?.video_info.fps || 30
  // Frame-by-frame playback speed (milliseconds between frames)
  const frameByFrameDelay = 500 // 0.5 seconds per frame, adjust as needed

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef(videoRef.current)
    }
  }, [onVideoRef])

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (frameByFrameIntervalRef.current) {
        clearInterval(frameByFrameIntervalRef.current)
      }
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isFrameByFrameMode) {
      const time = videoRef.current.currentTime
      setCurrentTime(time)
      const frame = Math.floor(time * fps)
      setCurrentFrame(frame)
      onFrameChange(frame)
    }
  }, [fps, onFrameChange, isFrameByFrameMode])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }, [])

  const stopFrameByFramePlayback = useCallback(() => {
    if (frameByFrameIntervalRef.current) {
      clearInterval(frameByFrameIntervalRef.current)
      frameByFrameIntervalRef.current = null
    }
    setIsPlaying(false)
    onPlayStateChange(false)
  }, [onPlayStateChange])

  const startFrameByFramePlayback = useCallback(() => {
    if (videoRef.current) {
      // Ensure video is paused for frame-by-frame control
      videoRef.current.pause()
      setIsPlaying(true)
      onPlayStateChange(true)

      frameByFrameIntervalRef.current = setInterval(() => {
        setCurrentFrame(prevFrame => {
          const maxFrames = annotationData ? annotationData.video_info.frame_count - 1 : Math.floor(duration * fps)
          const newFrame = prevFrame + 1
          
          if (newFrame > maxFrames) {
            // Stop at the end
            if (frameByFrameIntervalRef.current) {
              clearInterval(frameByFrameIntervalRef.current)
              frameByFrameIntervalRef.current = null
            }
            setIsPlaying(false)
            onPlayStateChange(false)
            return prevFrame
          }

          // Update video time and trigger frame change
          if (videoRef.current) {
            const time = newFrame / fps
            videoRef.current.currentTime = Math.min(time, duration)
            setCurrentTime(time)
          }
          onFrameChange(newFrame)
          return newFrame
        })
      }, frameByFrameDelay)
    }
  }, [fps, duration, annotationData, frameByFrameDelay, onFrameChange, onPlayStateChange])

  const togglePlayPause = useCallback(() => {
    if (isFrameByFrameMode) {
      // In frame-by-frame mode, toggle between playing frame-by-frame and paused
      if (isPlaying) {
        // Currently playing frame-by-frame, so pause it
        stopFrameByFramePlayback()
      } else {
        // Currently paused in frame-by-frame mode, so resume frame-by-frame playback
        startFrameByFramePlayback()
      }
      return
    }

    // Normal video playback mode
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
      onPlayStateChange(!isPlaying)
    }
  }, [isPlaying, isFrameByFrameMode, onPlayStateChange, startFrameByFramePlayback, stopFrameByFramePlayback])

  const toggleFrameByFrameMode = useCallback(() => {
    if (isFrameByFrameMode) {
      // Exiting frame-by-frame mode
      if (frameByFrameIntervalRef.current) {
        clearInterval(frameByFrameIntervalRef.current)
        frameByFrameIntervalRef.current = null
      }
      setIsFrameByFrameMode(false)
      
      // Sync video time with current frame before switching to normal playback
      if (videoRef.current) {
        const time = currentFrame / fps
        videoRef.current.currentTime = Math.min(time, duration)
        setCurrentTime(time)
        
        // Keep the current play state but switch to normal video playback
        if (isPlaying) {
          videoRef.current.play()
        }
      }
    } else {
      // Entering frame-by-frame mode
      if (videoRef.current) {
        const wasPlaying = isPlaying || !videoRef.current.paused
        videoRef.current.pause() // Always pause the video element in frame-by-frame mode
        
        // Sync currentFrame with video's current position
        const time = videoRef.current.currentTime
        const frame = Math.floor(time * fps)
        setCurrentFrame(frame)
        setCurrentTime(time)
        onFrameChange(frame)
        
        setIsFrameByFrameMode(true)
        // If we were playing, start frame-by-frame playback immediately
        if (wasPlaying) {
          startFrameByFramePlayback()
        }
      }
    }
  }, [isFrameByFrameMode, isPlaying, startFrameByFramePlayback, currentFrame, fps, duration, onFrameChange])

  const seekToFrame = useCallback((frame: number) => {
    if (videoRef.current && annotationData) {
      // Stop frame-by-frame playback when manually seeking, but keep the mode
      if (isFrameByFrameMode && frameByFrameIntervalRef.current) {
        clearInterval(frameByFrameIntervalRef.current)
        frameByFrameIntervalRef.current = null
        setIsPlaying(false)
        onPlayStateChange(false)
      }
      
      const time = frame / fps
      videoRef.current.currentTime = Math.min(time, duration)
      setCurrentFrame(frame)
      setCurrentTime(time)
      onFrameChange(frame)
    }
  }, [fps, duration, annotationData, onFrameChange, isFrameByFrameMode, onPlayStateChange])

  const stepFrame = useCallback(
    (direction: "forward" | "backward") => {
      const newFrame =
        direction === "forward" ? Math.min(currentFrame + 1, Math.floor(duration * fps)) : Math.max(currentFrame - 1, 0)
      seekToFrame(newFrame)
    },
    [currentFrame, duration, fps, seekToFrame],
  )

  const handleSliderChange = useCallback(
    (value: number[]) => {
      const frame = value[0]
      seekToFrame(frame)
    },
    [seekToFrame],
  )

  const formatTime = useCallback(
    (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      const frames = Math.floor((seconds % 1) * fps)
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${frames.toString().padStart(2, "0")}`
    },
    [fps],
  )

  const maxFrames = annotationData ? annotationData.video_info.frame_count - 1 : Math.floor(duration * fps)

  return (
    <div className="space-y-4">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-auto max-h-[60vh] object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => {
            if (!isFrameByFrameMode) {
              setIsPlaying(true)
              onPlayStateChange(true)
            }
          }}
          onPause={() => {
            if (!isFrameByFrameMode) {
              setIsPlaying(false)
              onPlayStateChange(false)
            }
          }}
        >
          <source src="/videos/test.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        
        {isFrameByFrameMode && (
          <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded text-sm">
            Frame-by-Frame Mode
          </div>
        )}
      </div>

      <Card className="bg-gray-800 border-gray-700 p-4">
        <div className="space-y-4">
          {/* Main Controls */}
          <div className="flex items-center justify-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => stepFrame("backward")}
              className="bg-gray-700 border-gray-600 hover:bg-gray-600"
            >
              <SkipBack className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              onClick={togglePlayPause}
              className="bg-gray-700 border-gray-600 hover:bg-gray-600"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => stepFrame("forward")}
              className="bg-gray-700 border-gray-600 hover:bg-gray-600"
            >
              <SkipForward className="w-4 h-4" />
            </Button>

            <Button
              variant={isFrameByFrameMode ? "default" : "outline"}
              size="sm"
              onClick={toggleFrameByFrameMode}
              className={
                isFrameByFrameMode
                  ? "bg-blue-600 border-blue-500 hover:bg-blue-700"
                  : "bg-gray-700 border-gray-600 hover:bg-gray-600"
              }
              title="Frame-by-frame playback"
            >
              <Timer className="w-4 h-4" />
            </Button>
          </div>

          {/* Timeline Scrubber */}
          <div className="space-y-2">
            <Slider
              value={[currentFrame]}
              onValueChange={handleSliderChange}
              max={maxFrames}
              step={1}
              className="w-full"
            />

            <div className="flex justify-between text-sm text-gray-400">
              <span>Frame: {currentFrame}</span>
              <span>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              {isFrameByFrameMode && (
                <span className="text-blue-400">
                  Frame-by-Frame ({frameByFrameDelay}ms/frame)
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}