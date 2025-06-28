"use client";

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { BoundingBox, VideoInfo } from "@/lib/types"

interface BoundingBoxCanvasProps {
  videoElement: HTMLVideoElement
  boundingBoxes: BoundingBox[]
  videoInfo: VideoInfo
  onBoundingBoxUpdate: (boxes: BoundingBox[]) => void
}

// Dynamically import Konva components to prevent SSR issues
const Stage = dynamic(() => import("react-konva").then(mod => ({ default: mod.Stage })), { ssr: false })
const Layer = dynamic(() => import("react-konva").then(mod => ({ default: mod.Layer })), { ssr: false })
const Rect = dynamic(() => import("react-konva").then(mod => ({ default: mod.Rect })), { ssr: false })
const Transformer = dynamic(() => import("react-konva").then(mod => ({ default: mod.Transformer })), { ssr: false })

export default function BoundingBoxCanvas({
  videoElement,
  boundingBoxes,
  videoInfo,
  onBoundingBoxUpdate,
}: BoundingBoxCanvasProps) {
  const stageRef = useRef<any>(null)
  const transformerRef = useRef<any>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
    setSelectedId(id === selectedId ? null : id)
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

  if (!mounted || stageSize.width === 0 || stageSize.height === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onClick={handleStageClick}
        className="pointer-events-auto"
      >
        <Layer>
          {boundingBoxes.map((box) => {
            const pixelCoords = convertNormalizedToPixel(box, stageSize.width, stageSize.height)

            return (
              <Rect
                key={box.id}
                id={box.id}
                x={pixelCoords.x}
                y={pixelCoords.y}
                width={pixelCoords.width}
                height={pixelCoords.height}
                stroke="#10b981"
                strokeWidth={2}
                fill="rgba(16, 185, 129, 0.1)"
                draggable
                onClick={() => handleRectClick(box.id)}
                onDragEnd={(e) => handleRectDragEnd(box.id, e)}
                onTransformEnd={(e) => handleRectTransform(box.id, e)}
              />
            )
          })}

          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Limit resize
              if (newBox.width < 10 || newBox.height < 10) {
                return oldBox
              }
              return newBox
            }}
          />
        </Layer>
      </Stage>
    </div>
  )
}