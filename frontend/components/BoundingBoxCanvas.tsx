"use client";

import { useEffect, useRef, useState } from "react"
import { Stage, Layer, Rect, Transformer, Group, Circle, Text, Line } from 'react-konva'
import type { BoundingBox, VideoInfo } from "@/lib/types"

interface BoundingBoxCanvasProps {
  videoElement: HTMLVideoElement
  boundingBoxes: BoundingBox[]
  videoInfo: VideoInfo
  /** Whether the video is currently playing. Used to disable dragging while playing */
  isPlaying: boolean
  /** Whether we are currently in add-bounding-box mode */
  isAddMode: boolean
  /** Add box mode: single or multi frame */
  addBoxMode: "single" | "multi"
  /** Current frame number */
  currentFrame: number
  /** Callback once a new box has been successfully added (or cancelled) */
  onAddComplete: () => void
  onBoundingBoxUpdate: (boxes: BoundingBox[]) => void
  /** Callback to show multi-frame modal with the new box */
  onShowMultiFrameModal: (newBox: BoundingBox) => void
}

function BoundingBoxCanvas({
  videoElement,
  boundingBoxes,
  videoInfo,
  isPlaying,
  isAddMode,
  addBoxMode,
  currentFrame,
  onAddComplete,
  onBoundingBoxUpdate,
  onShowMultiFrameModal,
}: BoundingBoxCanvasProps) {
  const stageRef = useRef<any>(null)
  const transformerRefs = useRef<{[key: string]: any}>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [videoDisplayArea, setVideoDisplayArea] = useState({ 
    x: 0, 
    y: 0, 
    width: 0, 
    height: 0,
    scaleX: 1,
    scaleY: 1
  })
  // State for drawing a new bounding box
  const [drawStart, setDrawStart] = useState<{x: number; y: number} | null>(null)
  const [drawEnd, setDrawEnd] = useState<{x: number; y: number} | null>(null)

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
    if (!isPlaying) {
      // When paused, attach transformers to all boxes
      boundingBoxes.forEach(box => {
        const transformer = transformerRefs.current[box.id]
        if (transformer) {
          const stage = stageRef.current
          if (stage) {
            const node = stage.findOne(`#${box.id}`)
            if (node) {
              transformer.nodes([node])
              transformer.getLayer()?.batchDraw()
            }
          }
        }
      })
    }
  }, [isPlaying, boundingBoxes])

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

  const handleMouseEnter = (id: string) => {
    if (!isPlaying) {
      setHoveredId(id)
      document.body.style.cursor = 'move'
    }
  }

  const handleMouseLeave = () => {
    setHoveredId(null)
    document.body.style.cursor = 'default'
  }

  const handleDeleteBox = (id: string) => {
    const updatedBoxes = boundingBoxes.filter(box => box.id !== id)
    onBoundingBoxUpdate(updatedBoxes)
    setHoveredId(null)
    setSelectedId(null)
  }

  const handleRectTransform = (id: string, e: any) => {
    const rect = e.target
    const group = rect.getParent()
    const scaleX = rect.scaleX()
    const scaleY = rect.scaleY()

    const updatedBoxes = boundingBoxes.map((box) => {
      if (box.id === id) {
        // Get the group position and add rect position (which should be 0,0 but account for transforms)
        const absoluteX = group.x() + rect.x()
        const absoluteY = group.y() + rect.y()
        
        // Convert back to normalized coordinates relative to video display area
        const normalizedX = (absoluteX - videoDisplayArea.x) / videoDisplayArea.width
        const normalizedY = (absoluteY - videoDisplayArea.y) / videoDisplayArea.height
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

    // Update group position if rect was moved during transform
    if (rect.x() !== 0 || rect.y() !== 0) {
      group.x(group.x() + rect.x())
      group.y(group.y() + rect.y())
      rect.x(0)
      rect.y(0)
    }

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

  // Utility to convert pixel coords to normalized relative to video display area
  const pixelToNormalized = (x: number, y: number) => {
    return {
      x: (x - videoDisplayArea.x) / videoDisplayArea.width,
      y: (y - videoDisplayArea.y) / videoDisplayArea.height,
    }
  }

  const handleStageMouseDown = (e: any) => {
    if (!isAddMode || isPlaying) return
    const pointerPos = e.target.getStage().getPointerPosition()
    if (!pointerPos) return
    setDrawStart(pointerPos)
    setDrawEnd(pointerPos)
  }

  const handleStageMouseMove = (e: any) => {
    if (!isAddMode || !drawStart) return
    const pointerPos = e.target.getStage().getPointerPosition()
    if (!pointerPos) return
    setDrawEnd(pointerPos)
  }

  const handleStageMouseUp = () => {
    if (!isAddMode || !drawStart || !drawEnd) {
      setDrawStart(null)
      setDrawEnd(null)
      return
    }

    // Compute rect with start and end
    const startX = Math.min(drawStart.x, drawEnd.x)
    const startY = Math.min(drawStart.y, drawEnd.y)
    const endX = Math.max(drawStart.x, drawEnd.x)
    const endY = Math.max(drawStart.y, drawEnd.y)

    // Convert to normalized
    const normStart = pixelToNormalized(startX, startY)
    const normEnd = pixelToNormalized(endX, endY)

    let newX = Math.max(0, normStart.x)
    let newY = Math.max(0, normStart.y)
    let newWidth = normEnd.x - normStart.x
    let newHeight = normEnd.y - normStart.y

    // Basic sanity threshold (at least 1% of width/height)
    if (newWidth > 0.01 && newHeight > 0.01) {
      const newBox: BoundingBox = {
        id: `box-${Date.now()}`,
        x: newX,
        y: newY,
        width: Math.min(1 - newX, newWidth),
        height: Math.min(1 - newY, newHeight),
        confidence: 1,
        type: "human",
        class: "manual",
      }

      if (addBoxMode === "multi") {
        // In multi-frame mode, trigger modal in parent
        onShowMultiFrameModal(newBox)
      } else {
        // Single frame mode - add directly
        onBoundingBoxUpdate([...boundingBoxes, newBox])
        onAddComplete()
      }
    } else {
      // Box too small, just complete
      onAddComplete()
    }

    // Reset drawing state
    setDrawStart(null)
    setDrawEnd(null)
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
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        className={isPlaying ? "pointer-events-none" : "pointer-events-auto"}
        style={{ pointerEvents: isPlaying ? 'none' : 'auto', cursor: isAddMode ? 'crosshair' : undefined }}
      >
        <Layer>
          {boundingBoxes.map((box) => {
            const pixelCoords = convertNormalizedToPixel(box)
            const color = getBoxColor(box.confidence, box.type)

            return (
              <Group 
                key={box.id}
                x={pixelCoords.x}
                y={pixelCoords.y}
                draggable={!isPlaying && !isAddMode}
                onDragEnd={(e) => {
                  // Update the box position based on the group's new position
                  const group = e.target
                  const normalizedX = (group.x() - videoDisplayArea.x) / videoDisplayArea.width
                  const normalizedY = (group.y() - videoDisplayArea.y) / videoDisplayArea.height
                  
                  const updatedBoxes = boundingBoxes.map((b) => {
                    if (b.id === box.id) {
                      return {
                        ...b,
                        x: Math.max(0, Math.min(1, normalizedX)),
                        y: Math.max(0, Math.min(1, normalizedY)),
                        type: "human" as const,
                      }
                    }
                    return b
                  })
                  onBoundingBoxUpdate(updatedBoxes)
                }}
                onMouseEnter={() => !isAddMode && handleMouseEnter(box.id)}
                onMouseLeave={handleMouseLeave}
                listening={!isPlaying && !isAddMode}
              >
                <Rect
                  id={box.id}
                  x={0}
                  y={0}
                  width={pixelCoords.width}
                  height={pixelCoords.height}
                  stroke={color}
                  strokeWidth={box.type === "human" ? 3 : 2} // Thicker stroke for human-modified boxes
                  fill={`${color}33`}
                  onClick={() => handleRectClick(box.id)}
                  onTap={() => handleRectClick(box.id)}
                  onTransformEnd={(e) => handleRectTransform(box.id, e)}
                />
                
                {/* Delete X button on hover */}
                {hoveredId === box.id && !isPlaying && (
                  <Group
                    x={pixelCoords.width / 2}
                    y={pixelCoords.height / 2}
                    onClick={() => handleDeleteBox(box.id)}
                    onTap={() => handleDeleteBox(box.id)}
                  >
                    <Circle
                      radius={10}
                      fill="rgba(0, 0, 0, 0.7)"
                      stroke="white"
                      strokeWidth={1}
                    />
                    <Text
                      text="×"
                      fontSize={16}
                      fontStyle="bold"
                      fill="white"
                      x={-5}
                      y={-8}
                    />
                  </Group>
                )}
              </Group>
            )
          })}

          {/* Individual transformers for each box when paused */}
          {!isPlaying && !isAddMode && boundingBoxes.map((box) => (
            <Transformer
              key={`transformer-${box.id}`}
              ref={(el) => {
                if (el) {
                  transformerRefs.current[box.id] = el
                } else {
                  delete transformerRefs.current[box.id]
                }
              }}
              boundBoxFunc={(oldBox, newBox) => {
                // Limit resize
                if (newBox.width < 10 || newBox.height < 10) {
                  return oldBox
                }
                return newBox
              }}
              enabledAnchors={[
                'top-left', 'top-center', 'top-right',
                'middle-left', 'middle-right',
                'bottom-left', 'bottom-center', 'bottom-right'
              ]}
              // Customize the corner handles to be white circles
              anchorFill="white"
              anchorStroke="#3b82f6"
              anchorStrokeWidth={2}
              anchorSize={8}
              anchorCornerRadius={4}
              borderEnabled={false}
              rotateEnabled={false}
            />
          ))}

          {/* Preview rectangle while drawing */}
          {isAddMode && drawStart && drawEnd && (
            <Rect
              x={Math.min(drawStart.x, drawEnd.x)}
              y={Math.min(drawStart.y, drawEnd.y)}
              width={Math.abs(drawEnd.x - drawStart.x)}
              height={Math.abs(drawEnd.y - drawStart.y)}
              stroke="#3b82f6"
              dash={[4, 4]}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default BoundingBoxCanvas