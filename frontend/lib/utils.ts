import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { BoundingBox, PixelCoordinates } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function convertNormalizedToPixel(
  box: BoundingBox,
  canvasWidth: number,
  canvasHeight: number,
): PixelCoordinates {
  return {
    x: box.x * canvasWidth,
    y: box.y * canvasHeight,
    width: box.width * canvasWidth,
    height: box.height * canvasHeight,
  }
}

export function convertPixelToNormalized(
  pixelCoords: PixelCoordinates,
  canvasWidth: number,
  canvasHeight: number,
): Omit<BoundingBox, "id" | "confidence" | "class"> {
  return {
    x: pixelCoords.x / canvasWidth,
    y: pixelCoords.y / canvasHeight,
    width: pixelCoords.width / canvasWidth,
    height: pixelCoords.height / canvasHeight,
  }
}
