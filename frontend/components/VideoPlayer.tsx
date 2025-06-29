"use client"

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { TimelineScrubber } from "@/components/TimelineScrubber"
import { Play, Pause, SkipBack, SkipForward, Timer, Plus, Copy, ChevronDown } from "lucide-react"
import type { AnnotationData } from "@/lib/types"

interface VideoPlayerProps {
  onVideoRef: (video: HTMLVideoElement | null) => void
  onFrameChange: (frame: number) => void
  onPlayStateChange: (isPlaying: boolean) => void
  annotationData: AnnotationData | null
  /** Whether we are currently in "add bounding box" mode */
  isAddMode: boolean
  /** Toggle the add-mode on / off */
  onToggleAddMode: () => void
  /** Multi-frame mode settings */
  addBoxMode: "single" | "multi"
  onAddBoxModeChange: (mode: "single" | "multi") => void
}

export interface VideoPlayerHandle {
  /** Seeks to given frame, pauses video, and ensures frame-by-frame mode */
  enterFrameByFrameAt: (frame: number) => void
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer({
  onVideoRef,
  onFrameChange,
  onPlayStateChange,
  annotationData,
  isAddMode,
  onToggleAddMode,
  addBoxMode,
  onAddBoxModeChange,
}: VideoPlayerProps, ref) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameByFrameIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const currentFrameRef = useRef(0)
  const [isFrameByFrameMode, setIsFrameByFrameMode] = useState(false)

  const fps = annotationData?.video_info.fps || 30
  // Frame-by-frame playback speed (milliseconds between frames)
  const frameByFrameDelay = 500 // 0.5 seconds per frame, adjust as needed

  // Add box button content and handler
  const getAddBoxIcon = () => {
    if (isAddMode) {
      return <span className="font-bold">×</span>
    }
    return addBoxMode === "multi" ? <Copy className="w-4 h-4" /> : <Plus className="w-4 h-4" />
  }

  const getAddBoxTooltip = () => {
    if (isAddMode) {
      return "Cancel add box"
    }
    return addBoxMode === "multi" ? "Add multi-frame box (N)" : "Add single-frame box (N)"
  }

  const handleMainButtonClick = () => {
    onToggleAddMode()
  }

  const handleDropdownClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

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

  // Keep ref in sync with state to avoid stale closures
  useEffect(() => {
    currentFrameRef.current = currentFrame
  }, [currentFrame])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isFrameByFrameMode) {
      const time = videoRef.current.currentTime
      setCurrentTime(time)
      const frame = Math.floor(time * fps)
      currentFrameRef.current = frame
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

  const advanceFrame = useCallback(async () => {
    if (!videoRef.current) return false

    const maxFrames = annotationData ? annotationData.video_info.frame_count - 1 : Math.floor(duration * fps)

    const nextFrame = currentFrameRef.current + 1
    if (nextFrame > maxFrames) {
      return false // Reached end
    }

    // Persist next frame to state and ref
    currentFrameRef.current = nextFrame
    setCurrentFrame(nextFrame)

    // Seek video to new time
    const time = nextFrame / fps
    videoRef.current.currentTime = Math.min(time, duration)
    setCurrentTime(time)
    onFrameChange(nextFrame)

    // Force the video element to render the frame (Safari fix)
    try {
      await videoRef.current.play()
      videoRef.current.pause()
    } catch (_) {
      /* swallow */
    }

    return true // Successfully advanced
  }, [fps, duration, annotationData, onFrameChange])

  const startFrameByFramePlayback = useCallback(() => {
    if (videoRef.current) {
      // Ensure video is paused for frame-by-frame control
      videoRef.current.pause()
      setIsPlaying(true)
      onPlayStateChange(true)

      frameByFrameIntervalRef.current = setInterval(async () => {
        const canContinue = await advanceFrame()
        
        if (!canContinue) {
          // Stop at the end
          stopFrameByFramePlayback()
        }
      }, frameByFrameDelay)
    }
  }, [advanceFrame, frameByFrameDelay, onPlayStateChange, stopFrameByFramePlayback])

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

  const toggleFrameByFrameMode = useCallback(async () => {
    if (isFrameByFrameMode) {
      // Exiting frame-by-frame mode
      stopFrameByFramePlayback()
      setIsFrameByFrameMode(false)
      
      // Sync video time with current frame before switching to normal playback
      if (videoRef.current) {
        const time = currentFrameRef.current / fps
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
        currentFrameRef.current = frame
        setCurrentTime(time)
        setCurrentFrame(frame)
        onFrameChange(frame)
        
        // Force the current frame to be displayed
        try {
          await videoRef.current.play()
          videoRef.current.pause()
        } catch (e) {
          // Ignore play errors
        }
        
        setIsFrameByFrameMode(true)
        
        // If we were playing, start frame-by-frame playback immediately
        if (wasPlaying) {
          startFrameByFramePlayback()
        }
      }
    }
  }, [isFrameByFrameMode, isPlaying, startFrameByFramePlayback, stopFrameByFramePlayback, currentFrameRef, fps, duration, onFrameChange])

  const seekToFrame = useCallback(async (frame: number) => {
    if (videoRef.current && annotationData) {
      // Stop frame-by-frame playback when manually seeking, but keep the mode
      if (isFrameByFrameMode && frameByFrameIntervalRef.current) {
        stopFrameByFramePlayback()
      }
      
      const time = frame / fps
      videoRef.current.currentTime = Math.min(time, duration)
      currentFrameRef.current = frame
      setCurrentFrame(frame)
      setCurrentTime(time)
      onFrameChange(frame)
      
      // If in frame-by-frame mode, force frame rendering
      if (isFrameByFrameMode) {
        try {
          await videoRef.current.play()
          videoRef.current.pause()
        } catch (e) {
          // Ignore play errors
        }
      }
    }
  }, [fps, duration, annotationData, onFrameChange, isFrameByFrameMode, stopFrameByFramePlayback])

  const stepFrame = useCallback(
    (direction: "forward" | "backward") => {
      const base = currentFrameRef.current
      const newFrame = direction === "forward" ? Math.min(base + 1, Math.floor(duration * fps)) : Math.max(base - 1, 0)
      seekToFrame(newFrame)
    },
    [duration, fps, seekToFrame],
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        // Ignore if typing in an input field to avoid conflicts
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
        }

        switch (event.key) {
            case " ":
                event.preventDefault(); // Prevent page scroll
                togglePlayPause();
                break;
            case "ArrowLeft":
                stepFrame("backward");
                break;
            case "ArrowRight":
                stepFrame("forward");
                break;
            case "k":
            case "K":
                toggleFrameByFrameMode();
                break;
            case "n":
            case "N":
                if (!isPlaying) {
                  // create new bounding box
                  onToggleAddMode()
                }

            default:
                break;
        }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
        window.removeEventListener("keydown", handleKeyDown);
    };
  }, [togglePlayPause, stepFrame, toggleFrameByFrameMode]);

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

  // Imperative handle for parent controls
  useImperativeHandle(ref, () => ({
    enterFrameByFrameAt: async (frame: number) => {
      // Pause any playback first
      if (videoRef.current) {
        videoRef.current.pause()
      }

      await seekToFrame(frame)

      // Ensure we are in frame-by-frame mode
      if (!isFrameByFrameMode) {
        toggleFrameByFrameMode()
      }
    },
  }))

  return (
    <TooltipProvider>
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
          
          {/* {isFrameByFrameMode && (
            <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded text-sm">
              Frame-by-Frame Mode
            </div>
          )} */}
        </div>

        <Card className="bg-gray-800 border-gray-700 p-4">
          <div className="space-y-4">
            {/* Main Controls */}
            <div className="flex items-center justify-between">
              {/* Left control cluster */}
              <div className="flex items-center space-x-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => stepFrame("backward")}
                      className="bg-gray-700 border-gray-600 hover:bg-gray-600"
                    >
                      <SkipBack className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Skip Back (Left Arrow)</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={togglePlayPause}
                      className="bg-gray-700 border-gray-600 hover:bg-gray-600"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isPlaying ? "Pause" : "Play"} (Space)</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => stepFrame("forward")}
                      className="bg-gray-700 border-gray-600 hover:bg-gray-600"
                    >
                      <SkipForward className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Skip Forward (Right Arrow)</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isFrameByFrameMode ? "default" : "outline"}
                      size="sm"
                      onClick={toggleFrameByFrameMode}
                      className={
                        isFrameByFrameMode
                          ? "bg-blue-600 border-blue-500 hover:bg-blue-700"
                          : "bg-gray-700 border-gray-600 hover:bg-gray-600"
                      }
                    >
                      <Timer className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle Frame-by-Frame (K)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              
              {/* Add bounding box button with dropdown (appears when paused) */}
              {!isPlaying && (
                <div className="flex items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative flex">
                        {/* Main button */}
                        <Button
                          variant={isAddMode ? "default" : "outline"}
                          size="sm"
                          onClick={handleMainButtonClick}
                          className={`${
                            isAddMode
                              ? "bg-red-600 border-red-500 hover:bg-red-700"
                              : "bg-gray-700 border-gray-600 hover:bg-gray-600"
                          } rounded-r-none border-r-0`}
                        >
                          {getAddBoxIcon()}
                        </Button>
                        
                        {/* Dropdown trigger */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant={isAddMode ? "default" : "outline"}
                              size="sm"
                              onClick={handleDropdownClick}
                              className={`${
                                isAddMode
                                  ? "bg-red-600 border-red-500 hover:bg-red-700"
                                  : "bg-gray-700 border-gray-600 hover:bg-gray-600"
                              } rounded-l-none px-2`}
                            >
                              <ChevronDown className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuRadioGroup 
                              value={addBoxMode} 
                              onValueChange={(value) => onAddBoxModeChange(value as "single" | "multi")}
                            >
                              <DropdownMenuRadioItem value="single" className="flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                Single Frame
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="multi" className="flex items-center gap-2">
                                <Copy className="w-4 h-4" />
                                Multi Frame
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{getAddBoxTooltip()}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Timeline Scrubber */}
            <div className="space-y-2">
              <div className="relative">
                <TimelineScrubber
                  value={[currentFrame]}
                  onValueChange={handleSliderChange}
                  max={maxFrames}
                  step={1}
                  videoElement={videoRef.current}
                  className="w-full"
                />
                

              </div>

              <div className="flex justify-between text-sm text-gray-400 font-mono">
                {/* Left side: Time display */}
                <span>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {/* Center (optional): Frame-by-frame mode indicator */}
                {isFrameByFrameMode && (
                  <span className="text-blue-400">
                    Frame-by-Frame ({frameByFrameDelay}ms/frame)
                  </span>
                )}

                {/* Right side: Frame counter */}
                <span>
                  frame: {currentFrame}/{maxFrames}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  )
})

export default VideoPlayer