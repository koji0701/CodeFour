"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import VideoPlayer, { VideoPlayerHandle } from "@/components/VideoPlayer"
import type { AnnotationData, BoundingBox } from "@/lib/types"
import dynamic from "next/dynamic"
import { Checkbox } from "@/components/ui/checkbox"

// Dynamically import the BoundingBoxCanvas component to avoid SSR issues
const BoundingBoxCanvas = dynamic(
  () => import('@/components/BoundingBoxCanvas'),
  { 
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center text-white">Loading canvas...</div>
  }
);

// Key for storing resolved frames in localStorage
const RESOLVED_STORAGE_KEY = "codefour-resolved-frames"

export default function VideoAnnotationEditor() {
  const [annotationData, setAnnotationData] = useState<AnnotationData | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(true)
  const [resolvedFrames, setResolvedFrames] = useState<Map<number, number>>(new Map())
  const videoPlayerRef = useRef<VideoPlayerHandle | null>(null)

  // Load resolved frames from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(RESOLVED_STORAGE_KEY)
      if (stored) {
        const obj = JSON.parse(stored) as Record<string, number>
        const map = new Map<number, number>(
          Object.entries(obj).map(([k, v]) => [parseInt(k, 10), v])
        )
        setResolvedFrames(map)
      }
    } catch (err) {
      console.error("Failed to load resolved frames", err)
    }
  }, [])

  // Persist resolved frames whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const obj: Record<number, number> = {}
      resolvedFrames.forEach((count, frame) => {
        obj[frame] = count
      })
      window.localStorage.setItem(RESOLVED_STORAGE_KEY, JSON.stringify(obj))
    } catch (err) {
      console.error("Failed to save resolved frames", err)
    }
  }, [resolvedFrames])

  const saveAnnotations = useCallback(async (data: AnnotationData) => {
    if (isSaving) return // Prevent multiple simultaneous saves
    
    setIsSaving(true)
    try {
      const response = await fetch('/api/annotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
      
      if (!response.ok) {
        throw new Error('Failed to save annotations')
      }
      
      console.log('Annotations saved successfully')
    } catch (error) {
      console.error('Error saving annotations:', error)
    } finally {
      setIsSaving(false)
    }
  }, [isSaving])

  // Auto-load annotations on component mount
  useEffect(() => {
    const loadAnnotations = async () => {
      setIsLoadingAnnotations(true)
      try {
        const response = await fetch('/api/annotations')
        if (!response.ok) {
          throw new Error(`Failed to load annotations: ${response.statusText}`)
        }
        
        const data: AnnotationData = await response.json()
        
        // Validate the data structure
        if (!data.video_info || !data.annotations) {
          throw new Error('Invalid annotation data format')
        }
        
        console.log('Loaded annotation data:', data)
        console.log('Available frames:', Object.keys(data.annotations).length)
        setAnnotationData(data)
        setCurrentFrame(0)
      } catch (error) {
        console.error('Error loading annotations:', error)
      } finally {
        setIsLoadingAnnotations(false)
      }
    }

    loadAnnotations()
  }, [])

  const handleFrameChange = useCallback((frame: number) => {
    setCurrentFrame(frame)
  }, [])

  const handleBoundingBoxUpdate = useCallback(
    (frameIndex: number, boxes: BoundingBox[]) => {
      if (!annotationData) return

      const updatedData = {
        ...annotationData,
        annotations: {
          ...annotationData.annotations,
          [frameIndex]: boxes,
        },
      }

      setAnnotationData(updatedData)
      
      // Save the updated data to the JSON file
      saveAnnotations(updatedData)
    },
    [annotationData, saveAnnotations],
  )

  const currentBoundingBoxes = annotationData?.annotations[currentFrame] || []

  // Toggle add mode – ensure video is paused before allowing
  const toggleAddMode = useCallback(() => {
    // If video is playing, ignore
    if (isPlaying) return
    setIsAddMode((prev) => {
      // Reset cursor when turning off
      if (prev) {
        document.body.style.cursor = "default"
      } else {
        document.body.style.cursor = "crosshair"
      }
      return !prev
    })
  }, [isPlaying])

  // Compute flagged frames based on face count deviations (see flagged-frames rule)
  const getFlaggedFrames = useCallback(() => {
    if (!annotationData) return [] as { frame: number; faceCount: number }[]

    const totalFrames = annotationData.video_info.frame_count
    // Build an array of face counts for every frame (default 0 if not annotated)
    const counts: number[] = Array(totalFrames).fill(0)
    Object.entries(annotationData.annotations).forEach(([frameStr, boxes]) => {
      const frame = parseInt(frameStr)
      counts[frame] = boxes.length
    })

    // Break counts into contiguous segments where the face count is identical
    type Segment = { start: number; end: number; count: number }
    const segments: Segment[] = []
    let currentCount = counts[0]
    let start = 0
    for (let i = 1; i < totalFrames; i++) {
      if (counts[i] !== currentCount) {
        segments.push({ start, end: i - 1, count: currentCount })
        currentCount = counts[i]
        start = i
      }
    }
    // push last segment
    segments.push({ start, end: totalFrames - 1, count: currentCount })

    // Identify flagged segments: 1-3 contiguous frames that have FEWER faces than matching surrounding segments.
    const flagged: { frame: number; faceCount: number }[] = []
    for (let i = 1; i < segments.length - 1; i++) {
      const prev = segments[i - 1]
      const curr = segments[i]
      const next = segments[i + 1]

      const segmentLength = curr.end - curr.start + 1

      const surroundsEqual = prev.count === next.count

      if (surroundsEqual && curr.count !== prev.count && segmentLength <= 3) {
        for (let f = curr.start; f <= curr.end; f++) {
          flagged.push({ frame: f, faceCount: counts[f] })
        }
      }
    }

    return flagged.sort((a, b) => a.frame - b.frame)
  }, [annotationData])

  // Filter out frames the user has resolved
  const flaggedFrames = getFlaggedFrames().filter((f) => resolvedFrames.get(f.frame) !== f.faceCount)

  // Show loading state while annotations are being loaded
  if (isLoadingAnnotations) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading annotations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-screen">
          {/* Video Player Section */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-gray-800 border-gray-700 p-4">
              <div className="relative">
                {isSaving && (
                  <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded text-sm z-10">
                    Saving...
                  </div>
                )}
                <VideoPlayer
                  ref={videoPlayerRef}
                  onVideoRef={setVideoElement}
                  onFrameChange={handleFrameChange}
                  onPlayStateChange={setIsPlaying}
                  annotationData={annotationData}
                  isAddMode={isAddMode}
                  onToggleAddMode={toggleAddMode}
                />
                {videoElement && annotationData && (
                  <BoundingBoxCanvas
                    videoElement={videoElement}
                    boundingBoxes={currentBoundingBoxes}
                    videoInfo={annotationData.video_info}
                    isPlaying={isPlaying}
                    isAddMode={isAddMode}
                    onAddComplete={() => {
                      setIsAddMode(false)
                      document.body.style.cursor = "default"
                    }}
                    onBoundingBoxUpdate={(boxes) => handleBoundingBoxUpdate(currentFrame, boxes)}
                  />
                )}
                {videoElement && annotationData && currentBoundingBoxes.length === 0 && !isAddMode && (
                  <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                    No detections for frame {currentFrame}
                  </div>
                )}
              </div>
            </Card>

            {/* Detection Legend - Horizontal layout under video */}
            {annotationData && (
              <Card className="bg-gray-800 border-gray-700 p-3">
                <div className="flex items-center justify-center space-x-6 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-blue-400 rounded"></div>
                    <span>Human-modified</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    <span>High confidence (&gt;90%)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-amber-500 rounded"></div>
                    <span>Medium confidence (70-90%)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded"></div>
                    <span>Low confidence (&lt;70%)</span>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Control Panel with Tabs */}
          <div className="space-y-4">
            {annotationData && (
              <Card className="bg-gray-800 border-gray-700 p-4">
                <Tabs defaultValue="video-info" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-700">
                    <TabsTrigger value="video-info" className="text-xs">Video Info</TabsTrigger>
                    <TabsTrigger value="current-frame" className="text-xs">Current Frame</TabsTrigger>
                    <TabsTrigger value="flagged-frames" className="text-xs">Flagged Frames</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="video-info" className="mt-4">
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-gray-400">Filename:</span>
                          <p className="font-mono text-xs">{annotationData.video_info.filename}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Duration:</span>
                          <p className="font-mono">{annotationData.video_info.duration.toFixed(2)}s</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Resolution:</span>
                          <p className="font-mono">
                            {annotationData.video_info.width}×{annotationData.video_info.height}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">FPS:</span>
                          <p className="font-mono">{annotationData.video_info.fps}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Frames:</span>
                          <p className="font-mono">{annotationData.video_info.frame_count}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Annotated:</span>
                          <p className="font-mono">{Object.keys(annotationData.annotations).length}</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="current-frame" className="mt-4">
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-400">Frame:</span>
                        <span className="ml-2 font-mono">{currentFrame}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Detections:</span>
                        <span className="ml-2 font-mono">{currentBoundingBoxes.length}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Playing:</span>
                        <span className="ml-2 font-mono">{isPlaying ? 'Yes' : 'No'}</span>
                      </div>
                      
                      {currentBoundingBoxes.length > 0 && (
                        <div className="mt-3">
                          <span className="text-gray-400 text-xs">Face Detections:</span>
                          <div className="mt-1 max-h-32 overflow-y-auto space-y-1">
                            {currentBoundingBoxes.map((box, index) => (
                              <div key={box.id} className="text-xs bg-gray-700 p-2 rounded">
                                <div className="font-mono text-xs">{box.id}</div>
                                <div className="text-gray-400">
                                  Confidence: {(box.confidence * 100).toFixed(1)}%
                                </div>
                                <div className="text-gray-400 text-xs">
                                  Position: ({(box.x * 100).toFixed(1)}%, {(box.y * 100).toFixed(1)}%)
                                </div>
                                <div className="text-gray-400 text-xs">
                                  Type: <span className={box.type === 'human' ? 'text-blue-400' : 'text-green-400'}>
                                    {box.type}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="flagged-frames" className="mt-4">
                    <div className="space-y-2 text-sm">
                      {flaggedFrames.length === 0 ? (
                        <div className="text-gray-400 text-center py-4">
                          No flagged frames found
                        </div>
                      ) : (
                        <>
                          <div className="text-gray-400 text-xs mb-2">
                            {flaggedFrames.length} frame{flaggedFrames.length > 1 ? 's' : ''} flagged
                          </div>
                          <div className="max-h-64 overflow-y-auto space-y-1">
                            {flaggedFrames.map((flagged) => (
                              <div
                                key={flagged.frame}
                                className="flex items-center text-xs bg-gray-700 p-2 rounded cursor-pointer hover:bg-gray-600 transition-colors"
                                onClick={() => {
                                  videoPlayerRef.current?.enterFrameByFrameAt(flagged.frame)
                                }}
                              >
                                <Checkbox
                                  className="mr-2"
                                  onClick={(e) => e.stopPropagation()}
                                  onCheckedChange={(checked) => {
                                    setResolvedFrames((prev) => {
                                      const next = new Map(prev)
                                      if (checked) {
                                        next.set(flagged.frame, flagged.faceCount)
                                      } else {
                                        next.delete(flagged.frame)
                                      }
                                      return next
                                    })
                                  }}
                                />
                                <span className="font-mono">Frame {flagged.frame}, {flagged.faceCount} face{flagged.faceCount !== 1 ? 's' : ''}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}