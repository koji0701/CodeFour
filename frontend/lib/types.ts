export interface VideoInfo {
  filename: string
  width: number
  height: number
  fps: number
  frame_count: number
  duration: number
}

export interface BoundingBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  class: string
}

export interface AnnotationData {
  video_info: VideoInfo
  annotations: Record<string, BoundingBox[]>
}

export interface PixelCoordinates {
  x: number
  y: number
  width: number
  height: number
}
