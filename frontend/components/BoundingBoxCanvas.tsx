"use client";

import { useEffect, useRef, useState } from "react"
import { Stage, Layer, Rect, Transformer } from 'react-konva'
import type { BoundingBox, VideoInfo } from "@/lib/types"

interface BoundingBoxCanvasProps {
  videoElement: HTMLVideoElement
  boundingBoxes: BoundingBox[]
  videoInfo: VideoInfo
  /** Whether the video is currently playing. Used to disable dragging while playing */
  isPlaying: boolean
  onBoundingBoxUpdate: (boxes: BoundingBox[]) => void
}

function BoundingBoxCanvas({
  videoElement,
  boundingBoxes,
  videoInfo,
  isPlaying,
  onBoundingBoxUpdate,
}: BoundingBoxCanvasProps) {
  const stageRef = useRef<any>(null)
  const transformerRef = useRef<any>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [videoDisplayArea, setVideoDisplayArea] = useState({ 
    x: 0, 
    y: 0, 
    width: 0, 
    height: 0,
    scaleX: 1,
    scaleY: 1
  })

  // Calculate the actual video display area within the video element
  const calculateVideoDisplayArea = () => {
    if (!videoElement || !videoInfo) return

    const elementRect = videoElement.getBoundingClientRect()
    const videoAspectRatio = videoInfo.width / videoInfo.height
    const elementAspectRatio = elementRect.width / elementRect.height

    let displayWidth, displayHeight, offsetX, offsetY

    if (elementAspectRatio > videoAspectRatio) {
      // Element is wider than video - letterboxed on sides
      displayHeight = elementRect.height
      displayWidth = displayHeight * videoAspectRatio
      offsetX = (elementRect.width - displayWidth) / 2
      offsetY = 0
    } else {
      // Element is taller than video - letterboxed on top/bottom
      displayWidth = elementRect.width
      displayHeight = displayWidth / videoAspectRatio
      offsetX = 0
      offsetY = (elementRect.height - displayHeight) / 2
    }

    setVideoDisplayArea({
      x: offsetX,
      y: offsetY,
      width: displayWidth,
      height: displayHeight,
      scaleX: displayWidth / videoInfo.width,
      scaleY: displayHeight / videoInfo.height
    })

    setStageSize({
      width: elementRect.width,
      height: elementRect.height,
    })
  }

  useEffect(() => {
    calculateVideoDisplayArea()
    window.addEventListener("resize", calculateVideoDisplayArea)

    const resizeObserver = new ResizeObserver(calculateVideoDisplayArea)
    if (videoElement) {
      resizeObserver.observe(videoElement)
    }

    return () => {
      window.removeEventListener("resize", calculateVideoDisplayArea)
      resizeObserver.disconnect()
    }
  }, [videoElement, videoInfo])

  useEffect(() => {
    if (transformerRef.current && selectedId) {
      const stage = stageRef.current
      if (stage) {
        const selectedNode = stage.findOne(`#${selectedId}`)
        if (selectedNode) {
          transformerRef.current.nodes([selectedNode])
          transformerRef.current.getLayer()?.batchDraw()
        }
      }
    }
  }, [selectedId])

  const handleRectClick = (id: string) => {
    if (!isPlaying) {
      setSelectedId(id === selectedId ? null : id)
    }
  }

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null)
    }
  }

  const handleRectDragEnd = (id: string, e: any) => {
    const rect = e.target
    
    const updatedBoxes = boundingBoxes.map((box) => {
      if (box.id === id) {
        // Convert back to normalized coordinates relative to video display area
        const normalizedX = (rect.x() - videoDisplayArea.x) / videoDisplayArea.width
        const normalizedY = (rect.y() - videoDisplayArea.y) / videoDisplayArea.height
        
        return {
          ...box,
          x: Math.max(0, Math.min(1, normalizedX)),
          y: Math.max(0, Math.min(1, normalizedY)),
          type: "human" as const,
        }
      }
      return box
    })

    onBoundingBoxUpdate(updatedBoxes)
  }

  const handleRectTransform = (id: string, e: any) => {
    const rect = e.target
    const scaleX = rect.scaleX()
    const scaleY = rect.scaleY()

    const updatedBoxes = boundingBoxes.map((box) => {
      if (box.id === id) {
        // Convert back to normalized coordinates relative to video display area
        const normalizedX = (rect.x() - videoDisplayArea.x) / videoDisplayArea.width
        const normalizedY = (rect.y() - videoDisplayArea.y) / videoDisplayArea.height
        const normalizedWidth = (rect.width() * scaleX) / videoDisplayArea.width
        const normalizedHeight = (rect.height() * scaleY) / videoDisplayArea.height
        
        return {
          ...box,
          x: Math.max(0, Math.min(1, normalizedX)),
          y: Math.max(0, Math.min(1, normalizedY)),
          width: Math.max(0, Math.min(1 - normalizedX, normalizedWidth)),
          height: Math.max(0, Math.min(1 - normalizedY, normalizedHeight)),
          type: "human" as const,
        }
      }
      return box
    })

    // Reset scale
    rect.scaleX(1)
    rect.scaleY(1)

    onBoundingBoxUpdate(updatedBoxes)
  }

  const convertNormalizedToPixel = (box: BoundingBox) => {
    // Convert normalized coordinates to pixel coordinates within the video display area
    return {
      x: videoDisplayArea.x + (box.x * videoDisplayArea.width),
      y: videoDisplayArea.y + (box.y * videoDisplayArea.height),
      width: box.width * videoDisplayArea.width,
      height: box.height * videoDisplayArea.height,
    }
  }

  const getBoxColor = (confidence: number, type: "ai-generated" | "human") => {
    // Human-modified boxes get a blue color regardless of confidence
    if (type === "human") {
      return "#3b82f6" // blue
    }
    
    // AI-generated boxes use confidence-based colors
    if (confidence > 0.9) return "#10b981" // green
    if (confidence > 0.7) return "#f59e0b" // amber
    return "#ef4444" // red
  }

  if (stageSize.width === 0 || stageSize.height === 0 || videoDisplayArea.width === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onClick={handleStageClick}
        className={isPlaying ? "pointer-events-none" : "pointer-events-auto"}
        style={{ pointerEvents: isPlaying ? 'none' : 'auto' }}
      >
        <Layer>
          {boundingBoxes.map((box) => {
            const pixelCoords = convertNormalizedToPixel(box)
            const color = getBoxColor(box.confidence, box.type)

            return (
              <Rect
                key={box.id}
                id={box.id}
                x={pixelCoords.x}
                y={pixelCoords.y}
                width={pixelCoords.width}
                height={pixelCoords.height}
                stroke={color}
                strokeWidth={box.type === "human" ? 3 : 2} // Thicker stroke for human-modified boxes
                fill={`${color}33`}
                draggable={!isPlaying}
                onClick={() => handleRectClick(box.id)}
                onTap={() => handleRectClick(box.id)}
                onDragEnd={(e) => handleRectDragEnd(box.id, e)}
                onTransformEnd={(e) => handleRectTransform(box.id, e)}
                listening={!isPlaying}
              />
            )
          })}

          {selectedId && !isPlaying && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // Limit resize
                if (newBox.width < 10 || newBox.height < 10) {
                  return oldBox
                }
                return newBox
              }}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default BoundingBoxCanvas