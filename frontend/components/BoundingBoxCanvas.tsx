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

  useEffect(() => {
    const updateStageSize = () => {
      if (videoElement) {
        const rect = videoElement.getBoundingClientRect()
        setStageSize({
          width: rect.width,
          height: rect.height,
        })
      }
    }

    updateStageSize()
    window.addEventListener("resize", updateStageSize)

    const resizeObserver = new ResizeObserver(updateStageSize)
    if (videoElement) {
      resizeObserver.observe(videoElement)
    }

    return () => {
      window.removeEventListener("resize", updateStageSize)
      resizeObserver.disconnect()
    }
  }, [videoElement])

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
        return {
          ...box,
          x: rect.x() / stageSize.width,
          y: rect.y() / stageSize.height,
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
        return {
          ...box,
          x: rect.x() / stageSize.width,
          y: rect.y() / stageSize.height,
          width: (rect.width() * scaleX) / stageSize.width,
          height: (rect.height() * scaleY) / stageSize.height,
        }
      }
      return box
    })

    // Reset scale
    rect.scaleX(1)
    rect.scaleY(1)

    onBoundingBoxUpdate(updatedBoxes)
  }

  const convertNormalizedToPixel = (box: BoundingBox, canvasWidth: number, canvasHeight: number) => {
    return {
      x: box.x * canvasWidth,
      y: box.y * canvasHeight,
      width: box.width * canvasWidth,
      height: box.height * canvasHeight,
    }
  }

  const getBoxColor = (confidence: number) => {
    if (confidence > 0.9) return "#10b981" // green
    if (confidence > 0.7) return "#f59e0b" // amber
    return "#ef4444" // red
  }

  if (stageSize.width === 0 || stageSize.height === 0) {
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
            const pixelCoords = convertNormalizedToPixel(box, stageSize.width, stageSize.height)
            const color = getBoxColor(box.confidence)

            return (
              <Rect
                key={box.id}
                id={box.id}
                x={pixelCoords.x}
                y={pixelCoords.y}
                width={pixelCoords.width}
                height={pixelCoords.height}
                stroke={color}
                strokeWidth={2}
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