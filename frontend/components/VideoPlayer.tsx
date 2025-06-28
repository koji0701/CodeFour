"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Card } from "@/components/ui/card"
import { Play, Pause, SkipBack, SkipForward } from "lucide-react"
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
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)

  const fps = annotationData?.video_info.fps || 30

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef(videoRef.current)
    }
  }, [onVideoRef])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime
      setCurrentTime(time)
      const frame = Math.floor(time * fps)
      setCurrentFrame(frame)
      onFrameChange(frame)
    }
  }, [fps, onFrameChange])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }, [])

  const togglePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
      onPlayStateChange(!isPlaying)
    }
  }, [isPlaying, onPlayStateChange])

  const seekToFrame = useCallback(
    (frame: number) => {
      if (videoRef.current && annotationData) {
        const time = frame / fps
        videoRef.current.currentTime = Math.min(time, duration)
        setCurrentFrame(frame)
        onFrameChange(frame)
      }
    },
    [fps, duration, annotationData, onFrameChange],
  )

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
            setIsPlaying(true)
            onPlayStateChange(true)
          }}
          onPause={() => {
            setIsPlaying(false)
            onPlayStateChange(false)
          }}
        >
          <source src="/videos/test.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
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
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
