
"use client"

import { useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import VideoPlayer from "@/components/VideoPlayer"
import JsonLoader from "@/components/JsonLoader"
import type { AnnotationData, BoundingBox } from "@/lib/types"
import dynamic from "next/dynamic"

// Dynamically import the BoundingBoxCanvas component to avoid SSR issues
const BoundingBoxCanvas = dynamic(
  () => import('@/components/BoundingBoxCanvas'),
  { 
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center text-white">Loading canvas...</div>
  }
);

export default function VideoAnnotationEditor() {
  const [annotationData, setAnnotationData] = useState<AnnotationData | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const handleJsonLoad = useCallback((data: AnnotationData) => {
    console.log('Loaded annotation data:', data)
    console.log('Available frames:', Object.keys(data.annotations).length)
    setAnnotationData(data)
    setCurrentFrame(0)
  }, [])

  const handleFrameChange = useCallback((frame: number) => {
    setCurrentFrame(frame)
  }, [])

  const handleBoundingBoxUpdate = useCallback(
    (frameIndex: number, boxes: BoundingBox[]) => {
      if (!annotationData) return

      setAnnotationData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          annotations: {
            ...prev.annotations,
            [frameIndex]: boxes,
          },
        }
      })
    },
    [annotationData],
  )

  const currentBoundingBoxes = annotationData?.annotations[currentFrame] || []

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-screen">
          {/* Video Player Section */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-gray-800 border-gray-700 p-4">
              <div className="relative">
                <VideoPlayer
                  onVideoRef={setVideoElement}
                  onFrameChange={handleFrameChange}
                  onPlayStateChange={setIsPlaying}
                  annotationData={annotationData}
                />
                {videoElement && annotationData && currentBoundingBoxes.length > 0 && (
                  <BoundingBoxCanvas
                    videoElement={videoElement}
                    boundingBoxes={currentBoundingBoxes}
                    videoInfo={annotationData.video_info}
                    onBoundingBoxUpdate={(boxes) => handleBoundingBoxUpdate(currentFrame, boxes)}
                  />
                )}
                {videoElement && annotationData && currentBoundingBoxes.length === 0 && (
                  <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                    No detections for frame {currentFrame}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Control Panel */}
          <div className="space-y-4">
            <JsonLoader onJsonLoad={handleJsonLoad} />

            {annotationData && (
              <Card className="bg-gray-800 border-gray-700 p-4">
                <h2 className="text-lg font-semibold mb-4">Video Info</h2>
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
              </Card>
            )}

            <Card className="bg-gray-800 border-gray-700 p-4">
              <h3 className="text-lg font-semibold mb-4">Current Frame</h3>
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Color Legend */}
            <Card className="bg-gray-800 border-gray-700 p-4">
              <h3 className="text-lg font-semibold mb-4">Detection Legend</h3>
              <div className="space-y-2 text-sm">
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
          </div>
        </div>
      </div>
    </div>
  )
}