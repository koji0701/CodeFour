"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import VideoPlayer, { VideoPlayerHandle } from "@/components/VideoPlayer"
import type { AnnotationData, BoundingBox } from "@/lib/types"
import { UndoRedoManager, type UndoRedoAction } from "@/lib/undoRedoManager"
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

// Grouped box interface for tracking selected boxes during grouping
interface GroupedBox {
  frame: number
  boxId: string
  box: BoundingBox
}

export default function VideoAnnotationEditor() {
  const [annotationData, setAnnotationData] = useState<AnnotationData | null>(null)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(true)
  const [resolvedFrames, setResolvedFrames] = useState<Map<number, number>>(new Map())
  const [addBoxMode, setAddBoxMode] = useState<"single" | "multi">("single")
  // Multi-frame modal state
  const [showFrameCountInput, setShowFrameCountInput] = useState(false)
  const [frameCountInput, setFrameCountInput] = useState("")
  const [pendingBox, setPendingBox] = useState<BoundingBox | null>(null)
  const videoPlayerRef = useRef<VideoPlayerHandle | null>(null)
  
  // Grouping functionality state
  const [isGroupingMode, setIsGroupingMode] = useState(false)
  const [showGroupNameInput, setShowGroupNameInput] = useState(false)
  const [groupNameInput, setGroupNameInput] = useState("")
  const [selectedBoxesForGrouping, setSelectedBoxesForGrouping] = useState<GroupedBox[]>([])
  const [currentGroupName, setCurrentGroupName] = useState("")
  
  // Undo/Redo management
  const undoRedoManagerRef = useRef<UndoRedoManager>(new UndoRedoManager())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Helper to update undo/redo state
  const updateUndoRedoState = useCallback(() => {
    setCanUndo(undoRedoManagerRef.current.canUndo())
    setCanRedo(undoRedoManagerRef.current.canRedo())
  }, [])

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
    (frameIndex: number, boxes: BoundingBox[], skipUndoRecord = false) => {
      if (!annotationData) return

      const beforeState = annotationData.annotations[frameIndex] || []
      
      // Record undo action if not skipping (e.g., during undo/redo)
      if (!skipUndoRecord) {
        const actionType = beforeState.length === 0 ? 'add' : 
                         boxes.length === 0 ? 'delete' : 'edit'
        
        undoRedoManagerRef.current.recordSingleFrameAction(
          actionType,
          frameIndex,
          beforeState,
          boxes
        )
        updateUndoRedoState()
      }

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
    [annotationData, saveAnnotations, updateUndoRedoState],
  )

  const handleMultiFrameBoundingBoxUpdate = useCallback(
    (startFrame: number, frameCount: number, newBox: BoundingBox, skipUndoRecord = false) => {
      if (!annotationData) return

      const maxFrame = annotationData.video_info.frame_count - 1
      const endFrame = Math.min(startFrame + frameCount - 1, maxFrame)
      
      const affectedFrames = []
      const beforeStates: Record<number, BoundingBox[]> = {}
      const afterStates: Record<number, BoundingBox[]> = {}
      
      const updatedAnnotations = { ...annotationData.annotations }
      
      // Add the box to each frame in the range
      for (let frame = startFrame; frame <= endFrame; frame++) {
        const existingBoxes = updatedAnnotations[frame] || []
        const boxWithUniqueId = {
          ...newBox,
          id: `${newBox.id}_f${frame}`, // Make ID unique per frame
        }
        
        affectedFrames.push(frame)
        beforeStates[frame] = [...existingBoxes]
        afterStates[frame] = [...existingBoxes, boxWithUniqueId]
        
        updatedAnnotations[frame] = [...existingBoxes, boxWithUniqueId]
      }

      // Record undo action if not skipping
      if (!skipUndoRecord) {
        undoRedoManagerRef.current.recordMultiFrameAction(
          startFrame,
          affectedFrames,
          beforeStates,
          afterStates
        )
        updateUndoRedoState()
      }

      const updatedData = {
        ...annotationData,
        annotations: updatedAnnotations,
      }

      setAnnotationData(updatedData)
      
      // Save the updated data to the JSON file
      saveAnnotations(updatedData)
    },
    [annotationData, saveAnnotations, updateUndoRedoState],
  )

  // Handle multi-frame modal
  const handleShowMultiFrameModal = useCallback((newBox: BoundingBox) => {
    setPendingBox(newBox)
    setShowFrameCountInput(true)
    setFrameCountInput("10") // Default to 10 frames
  }, [])

  const handleFrameCountConfirm = useCallback(() => {
    if (pendingBox && showFrameCountInput) {
      const frameCount = parseInt(frameCountInput, 10)
      if (frameCount > 0) {
        handleMultiFrameBoundingBoxUpdate(currentFrame, frameCount, pendingBox)
      }
    }
    
    // Reset state
    setShowFrameCountInput(false)
    setPendingBox(null)
    setFrameCountInput("")
    setIsAddMode(false)
    document.body.style.cursor = "default"
  }, [pendingBox, showFrameCountInput, frameCountInput, currentFrame, handleMultiFrameBoundingBoxUpdate])

  const handleFrameCountCancel = useCallback(() => {
    setShowFrameCountInput(false)
    setPendingBox(null)
    setFrameCountInput("")
    setIsAddMode(false)
    document.body.style.cursor = "default"
  }, [])

  // Grouping functionality handlers
  const handleStartGrouping = useCallback(() => {
    if (isPlaying) return
    setShowGroupNameInput(true)
    setGroupNameInput("")
  }, [isPlaying])

  const handleGroupNameConfirm = useCallback(() => {
    if (groupNameInput.trim()) {
      setCurrentGroupName(groupNameInput.trim())
      setIsGroupingMode(true)
      setShowGroupNameInput(false)
      setSelectedBoxesForGrouping([])
    }
  }, [groupNameInput])

  const handleGroupNameCancel = useCallback(() => {
    setShowGroupNameInput(false)
    setGroupNameInput("")
  }, [])

  const handleCancelGrouping = useCallback(() => {
    setIsGroupingMode(false)
    setCurrentGroupName("")
    setSelectedBoxesForGrouping([])
  }, [])

  const handleBoxClickForGrouping = useCallback((boxId: string, frame: number) => {
    if (!isGroupingMode || !annotationData) return

    // Check if this frame already has a selected box
    const existingFrameSelection = selectedBoxesForGrouping.find(gb => gb.frame === frame)
    
    if (existingFrameSelection) {
      if (existingFrameSelection.boxId === boxId) {
        // Clicking the same box - deselect it
        setSelectedBoxesForGrouping(prev => prev.filter(gb => gb.frame !== frame))
      } else {
        // Clicking a different box in the same frame - replace the selection
        const box = annotationData.annotations[frame]?.find(b => b.id === boxId)
        if (box) {
          setSelectedBoxesForGrouping(prev => 
            prev.map(gb => gb.frame === frame ? { frame, boxId, box } : gb)
          )
        }
      }
    } else {
      // No box selected for this frame yet - add the selection
      const box = annotationData.annotations[frame]?.find(b => b.id === boxId)
      if (box) {
        setSelectedBoxesForGrouping(prev => [...prev, { frame, boxId, box }])
      }
    }
  }, [isGroupingMode, annotationData, selectedBoxesForGrouping])

  const handleFinishGrouping = useCallback(() => {
    if (!annotationData || selectedBoxesForGrouping.length === 0) return

    // Update the JSON IDs for all selected boxes
    const updatedAnnotations = { ...annotationData.annotations }
    
    selectedBoxesForGrouping.forEach(({ frame, boxId }) => {
      if (updatedAnnotations[frame]) {
        updatedAnnotations[frame] = updatedAnnotations[frame].map(box => 
          box.id === boxId ? { ...box, id: currentGroupName } : box
        )
      }
    })

    const updatedData = {
      ...annotationData,
      annotations: updatedAnnotations,
    }

    setAnnotationData(updatedData)
    saveAnnotations(updatedData)

    // Reset grouping state
    setIsGroupingMode(false)
    setCurrentGroupName("")
    setSelectedBoxesForGrouping([])
  }, [annotationData, selectedBoxesForGrouping, currentGroupName, saveAnnotations])

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

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    if (isPlaying || !annotationData) return
    
    const result = undoRedoManagerRef.current.undo()
    if (!result) return

    const { action, targetFrame } = result

    if (action.type === 'multi-add') {
      // Multi-frame action - restore all affected frames
      if (action.beforeStates) {
        const updatedAnnotations = { ...annotationData.annotations }
        
        for (const [frameStr, beforeState] of Object.entries(action.beforeStates)) {
          const frame = parseInt(frameStr, 10)
          updatedAnnotations[frame] = beforeState
        }

        const updatedData = {
          ...annotationData,
          annotations: updatedAnnotations,
        }

        setAnnotationData(updatedData)
        saveAnnotations(updatedData)
      }
    } else {
      // Single-frame action
      if (action.beforeState) {
        handleBoundingBoxUpdate(action.frame, action.beforeState, true) // skipUndoRecord = true
      }
    }

    // Jump to the frame where the action occurred
    setCurrentFrame(targetFrame)
    if (videoPlayerRef.current) {
      videoPlayerRef.current.enterFrameByFrameAt(targetFrame)
    }

    updateUndoRedoState()
  }, [isPlaying, annotationData, handleBoundingBoxUpdate, saveAnnotations, updateUndoRedoState])

  const handleRedo = useCallback(() => {
    if (isPlaying || !annotationData) return
    
    const result = undoRedoManagerRef.current.redo()
    if (!result) return

    const { action, targetFrame } = result

    if (action.type === 'multi-add') {
      // Multi-frame action - restore all affected frames
      if (action.afterStates) {
        const updatedAnnotations = { ...annotationData.annotations }
        
        for (const [frameStr, afterState] of Object.entries(action.afterStates)) {
          const frame = parseInt(frameStr, 10)
          updatedAnnotations[frame] = afterState
        }

        const updatedData = {
          ...annotationData,
          annotations: updatedAnnotations,
        }

        setAnnotationData(updatedData)
        saveAnnotations(updatedData)
      }
    } else {
      // Single-frame action
      if (action.afterState) {
        handleBoundingBoxUpdate(action.frame, action.afterState, true) // skipUndoRecord = true
      }
    }

    // Jump to the frame where the action occurred
    setCurrentFrame(targetFrame)
    if (videoPlayerRef.current) {
      videoPlayerRef.current.enterFrameByFrameAt(targetFrame)
    }

    updateUndoRedoState()
  }, [isPlaying, annotationData, handleBoundingBoxUpdate, saveAnnotations, updateUndoRedoState])

  // Compute flagged frames based on object count deviations and low confidence objects
  const getFlaggedFrames = useCallback(() => {
    if (!annotationData) return [] as { frame: number; faceCount: number; reason?: string }[]

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

    // Identify flagged segments: 1-3 contiguous frames that have FEWER objects than matching surrounding segments.
    const flagged: { frame: number; faceCount: number; reason?: string }[] = []
    for (let i = 1; i < segments.length - 1; i++) {
      const prev = segments[i - 1]
      const curr = segments[i]
      const next = segments[i + 1]

      const segmentLength = curr.end - curr.start + 1

      const surroundsEqual = prev.count === next.count

      if (surroundsEqual && curr.count !== prev.count && segmentLength <= 3) {
        for (let f = curr.start; f <= curr.end; f++) {
          flagged.push({ frame: f, faceCount: counts[f], reason: 'Object count deviation' })
        }
      }
    }

    // Check for frames with low confidence objects (< 70%)
    Object.entries(annotationData.annotations).forEach(([frameStr, boxes]) => {
      const frame = parseInt(frameStr)
      const hasLowConfidence = boxes.some(box => box.confidence < 0.7)
      
      if (hasLowConfidence) {
        // Check if this frame is already flagged for object count deviation
        const alreadyFlagged = flagged.find(f => f.frame === frame)
        if (!alreadyFlagged) {
          flagged.push({ frame, faceCount: counts[frame], reason: 'Low confidence detection' })
        } else {
          // Update reason to include both issues
          alreadyFlagged.reason = 'Object count deviation & low confidence'
        }
      }
    })

    return flagged.sort((a, b) => a.frame - b.frame)
  }, [annotationData])

  // Filter out frames the user has resolved
  const flaggedFrames = getFlaggedFrames().filter((f) => {
    const resolvedCount = resolvedFrames.get(f.frame)
    // A frame is considered resolved if the user marked it as resolved 
    // and the face count hasn't changed since then
    return resolvedCount !== f.faceCount
  })

  // Get current groupings (IDs that appear in multiple frames)
  const getCurrentGroupings = useCallback(() => {
    if (!annotationData) return []

    const idFrameMap = new Map<string, number[]>()
    
    // Collect all frames for each ID
    Object.entries(annotationData.annotations).forEach(([frameStr, boxes]) => {
      const frame = parseInt(frameStr)
      boxes.forEach(box => {
        if (!idFrameMap.has(box.id)) {
          idFrameMap.set(box.id, [])
        }
        idFrameMap.get(box.id)!.push(frame)
      })
    })

    // Filter to only include IDs that appear in multiple frames and sort frames
    const groupings = Array.from(idFrameMap.entries())
      .filter(([_, frames]) => frames.length > 1)
      .map(([id, frames]) => ({
        id,
        frames: frames.sort((a, b) => a - b),
        firstFrame: Math.min(...frames),
        totalBoxes: frames.length
      }))
      .sort((a, b) => a.id.localeCompare(b.id))

    return groupings
  }, [annotationData])

  const currentGroupings = getCurrentGroupings()

  // Show loading state while annotations are being loaded
  if (isLoadingAnnotations) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading annotations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-screen">
          {/* Video Player Section */}
          <div className="lg:col-span-2">
            <Card className="control-panel p-4">
              <div className="relative">
                {isSaving && (
                  <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded text-sm z-10">
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
                  addBoxMode={addBoxMode}
                  onAddBoxModeChange={setAddBoxMode}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  isGroupingMode={isGroupingMode}
                  onStartGrouping={handleStartGrouping}
                  onCancelGrouping={handleCancelGrouping}
                />
                {videoElement && annotationData && (
                  <BoundingBoxCanvas
                    videoElement={videoElement}
                    boundingBoxes={currentBoundingBoxes}
                    videoInfo={annotationData.video_info}
                    isPlaying={isPlaying}
                    isAddMode={isAddMode}
                    addBoxMode={addBoxMode}
                    currentFrame={currentFrame}
                    onAddComplete={() => {
                      setIsAddMode(false)
                      document.body.style.cursor = "default"
                    }}
                    onBoundingBoxUpdate={(boxes) => handleBoundingBoxUpdate(currentFrame, boxes)}
                    onShowMultiFrameModal={handleShowMultiFrameModal}
                    isGroupingMode={isGroupingMode}
                    onBoxClickForGrouping={handleBoxClickForGrouping}
                    selectedBoxesForGrouping={selectedBoxesForGrouping}
                  />
                )}
                {videoElement && annotationData && currentBoundingBoxes.length === 0 && !isAddMode && (
                  <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                    No detections for frame {currentFrame}
                  </div>
                )}
              </div>
            {/* Detection Legend - Horizontal layout under video */}
            {annotationData && (
                <div className="flex items-center justify-center space-x-6 text-sm mt-4">
                  <div className="confidence-indicator">
                    <div className="confidence-dot bg-accent"></div>
                    <span>Human-modified</span>
                  </div>
                  <div className="confidence-indicator">
                    <div className="confidence-dot confidence-high"></div>
                    <span>High confidence (&gt;90%)</span>
                  </div>
                  <div className="confidence-indicator">
                    <div className="confidence-dot confidence-medium"></div>
                    <span>Medium confidence (70-90%)</span>
                  </div>
                  <div className="confidence-indicator">
                    <div className="confidence-dot confidence-low"></div>
                    <span>Low confidence (&lt;70%)</span>
                  </div>
                </div>
            )}
            </Card>
          </div>

          {/* Control Panel with Tabs */}
          <div className="space-y-4 h-full flex flex-col">
            {annotationData && (
              <Card className="control-panel p-4 h-full flex flex-col">
              <Tabs defaultValue="current-frame" className="tabs-enhanced h-full flex flex-col">
                  <TabsList className="tabs-list-enhanced">
                  <TabsTrigger value="current-frame" className="tabs-trigger-enhanced">Current Frame</TabsTrigger>
                    <TabsTrigger value="group-boxes" className="tabs-trigger-enhanced">Group Boxes</TabsTrigger>
                    <TabsTrigger value="flagged-frames" className="tabs-trigger-enhanced">Flagged Frames</TabsTrigger>
                  </TabsList>
                  <TabsContent value="group-boxes" className="mt-4 overflow-hidden">
  <div className="h-full flex flex-col text-sm">
    {isGroupingMode && (
      <div className="mb-4 flex-shrink-0">
        <Button
          onClick={handleFinishGrouping}
          disabled={selectedBoxesForGrouping.length === 0}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
        >
          Finish Grouping ({selectedBoxesForGrouping.length} boxes selected)
        </Button>
        {currentGroupName && (
          <p className="text-center mt-2 text-muted-foreground">
            Grouping as: <span className="font-semibold text-orange-500">{currentGroupName}</span>
          </p>
        )}
      </div>
    )}
    
    {/* Show current groupings when not in grouping mode and no boxes selected */}
    {!isGroupingMode && selectedBoxesForGrouping.length === 0 ? (
      <div className="h-full flex flex-col">
        {currentGroupings.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            No existing groupings found
          </div>
        ) : (
          <>
            <div className="info-label mb-4 flex-shrink-0">
              {currentGroupings.length} existing group{currentGroupings.length > 1 ? 's' : ''}
            </div>
            <div className="flex-1 overflow-y-auto pr-1 min-h-0">
              <div className="space-y-2">
                {currentGroupings.map((grouping) => (
                  <div
                    key={grouping.id}
                    className="flagged-frame-item flex items-center text-xs cursor-pointer hover:bg-muted/50 rounded p-2 transition-colors"
                    onClick={() => {
                      videoPlayerRef.current?.enterFrameByFrameAt(grouping.firstFrame)
                    }}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="detection-value font-semibold">
                        {grouping.id}
                      </div>
                      <div className="detection-label">
                        {grouping.totalBoxes} boxes across {grouping.frames.length} frames
                      </div>
                      <div className="detection-label text-xs text-muted-foreground">
                        Frames: {grouping.frames.slice(0, 5).join(', ')}{grouping.frames.length > 5 ? '...' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    ) : isGroupingMode && selectedBoxesForGrouping.length === 0 ? (
      <div className="text-muted-foreground text-center py-8">
        Click on boxes to add them to the group
      </div>
    ) : (
      <>
        <div className="info-label mb-2 flex-shrink-0">
          {selectedBoxesForGrouping.length} box{selectedBoxesForGrouping.length > 1 ? 'es' : ''} selected
        </div>
        <div className="flex-1 overflow-y-auto pr-1 min-h-0">
          <div className="space-y-2">
            {selectedBoxesForGrouping
              .sort((a, b) => a.frame - b.frame)
              .map((groupedBox) => (
                <div
                  key={`${groupedBox.frame}-${groupedBox.boxId}`}
                  className="flagged-frame-item flex items-center text-xs cursor-pointer hover:bg-muted/50 rounded p-2 transition-colors"
                  onClick={() => {
                    videoPlayerRef.current?.enterFrameByFrameAt(groupedBox.frame)
                  }}
                >
                  <div className="flex-1 space-y-1">
                    <div className="detection-value">
                      Frame {groupedBox.frame} - Box {groupedBox.boxId}
                    </div>
                    <div className="detection-label">
                      Confidence: {(groupedBox.box.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </>
    )}
  </div>
</TabsContent>
                  <TabsContent value="current-frame" className="mt-4 overflow-y-auto">
  <div className="space-y-4 text-sm">
    <div className="video-info-grid">
      <div className="video-info-item">
        <span className="info-label">Frame: </span>
        <span className="info-value">{currentFrame}</span>
      </div>
      <div className="video-info-item">
        <span className="info-label">Detections: </span>
        <span className="info-value">{currentBoundingBoxes.length}</span>
      </div>
      <div className="video-info-item">
        <span className="info-label">Playing: </span>
        <span className="info-value">{isPlaying ? 'Yes' : 'No'}</span>
      </div>
    </div>
    
    {currentBoundingBoxes.length > 0 && (
      <>
        <span className="info-label">Object Detections:</span>
        <div className="space-y-3">
          {currentBoundingBoxes.map((box, index) => (
            <div key={box.id} className="detection-item">
              <div className="detection-value font-semibold mb-2">{box.id}</div>
              <div className="detection-label">
                Confidence: <span className="detection-value">{(box.confidence * 100).toFixed(1)}%</span>
              </div>
              <div className="detection-label">
                Position: <span className="detection-value">({(box.x * 100).toFixed(1)}%, {(box.y * 100).toFixed(1)}%)</span>
              </div>
              <div className="detection-label">
                Type: <span className={box.type === 'human' ? 'text-accent' : 'text-secondary'}>
                  {box.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
</TabsContent>

<TabsContent value="flagged-frames" className="mt-4 overflow-y-auto">
  <div className="text-sm">
    {flaggedFrames.length === 0 ? (
      <div className="text-muted-foreground text-center py-8">
        No flagged frames found
      </div>
    ) : (
      <div className="space-y-4">
        <div className="info-label">
          {flaggedFrames.length} frame{flaggedFrames.length > 1 ? 's' : ''} flagged
        </div>
        <div className="space-y-2">
          {flaggedFrames.map((flagged) => (
            <div
              key={flagged.frame}
              className="flagged-frame-item flex items-center text-xs cursor-pointer hover:bg-muted/50 rounded p-2 transition-colors"
              onClick={() => {
                videoPlayerRef.current?.enterFrameByFrameAt(flagged.frame)
              }}
            >
              <Checkbox
                className="mr-3 flex-shrink-0"
                checked={resolvedFrames.has(flagged.frame)}
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
              <div className="flex-1 space-y-1">
                <div className="detection-value">Frame {flagged.frame}, {flagged.faceCount} object{flagged.faceCount !== 1 ? 's' : ''}</div>
                {flagged.reason && (
                  <div className="detection-label">{flagged.reason}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
</TabsContent>
                </Tabs>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Multi-frame input modal - outside canvas to avoid event conflicts */}
      {showFrameCountInput && pendingBox && annotationData && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Multi-Frame Box</h3>
            <p className="modal-description">
              Enter the number of frames to apply this bounding box to:
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max={annotationData.video_info.frame_count - currentFrame}
                value={frameCountInput}
                onChange={(e) => setFrameCountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleFrameCountConfirm()
                  } else if (e.key === "Escape") {
                    handleFrameCountCancel()
                  }
                }}
                className="form-input w-20"
                placeholder="10"
                autoFocus
              />
              <span className="text-muted-foreground text-sm">frames</span>
              <button
                onClick={handleFrameCountConfirm}
                className="action-button-primary"
              >
                Apply
              </button>
              <button
                onClick={handleFrameCountCancel}
                className="action-button-secondary"
              >
                Cancel
              </button>
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              Will apply to frames {currentFrame} - {Math.min(currentFrame + parseInt(frameCountInput || "0", 10) - 1, annotationData.video_info.frame_count - 1)}
            </p>
          </div>
        </div>
      )}

      {/* Group name input modal */}
      {showGroupNameInput && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Group Boxes</h3>
            <p className="modal-description">
              Enter a name for this group:
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleGroupNameConfirm()
                  } else if (e.key === "Escape") {
                    handleGroupNameCancel()
                  }
                }}
                className="form-input"
                placeholder="e.g., Koji"
                autoFocus
              />
              <button
                onClick={handleGroupNameConfirm}
                disabled={!groupNameInput.trim()}
                className="action-button-primary"
              >
                Start Grouping
              </button>
              <button
                onClick={handleGroupNameCancel}
                className="action-button-secondary"
              >
                Cancel
              </button>
            </div>
            <p className="text-muted-foreground text-xs mt-2">
              This name will be assigned to all selected boxes
            </p>
          </div>
        </div>
      )}
    </div>
  )
}