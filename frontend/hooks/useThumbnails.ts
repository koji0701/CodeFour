import { useState, useEffect, useRef } from 'react'

interface Thumbnail {
  src: string
  time: number
}

/**
 * Hook for generating and caching video thumbnails for timeline scrubber
 */
export function useThumbnails(
  videoElement: HTMLVideoElement | null, 
  duration: number,
  thumbnailCount: number = 10
) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const generationPromiseRef = useRef<Promise<void> | null>(null)
  const lastDurationRef = useRef<number>(0)

  useEffect(() => {
    if (!videoElement || !duration || duration <= 0) {
      setThumbnails([])
      return
    }

    // Avoid duplicate generation
    if (isGenerating || generationPromiseRef.current) {
      return
    }

    // Don't regenerate if we already have thumbnails for this duration
    if (thumbnails.length > 0 && Math.abs(lastDurationRef.current - duration) < 0.1) {
      return
    }

    const generateThumbnails = async () => {
      setIsGenerating(true)
      
      try {
        const thumbs: Thumbnail[] = []
        
        // Create canvas once for reuse
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas')
          canvasRef.current.width = 80
          canvasRef.current.height = 45
        }
        
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')!
        
        // Store original video state
        const originalTime = videoElement.currentTime
        const originalPaused = videoElement.paused
        
        // Ensure video is paused during thumbnail generation
        videoElement.pause()
        
        // Generate thumbnails at 10% intervals (0%, 10%, 20%, ..., 90%)
        for (let i = 0; i < thumbnailCount; i++) {
          const percentage = i * 10 // 0%, 10%, 20%, ..., 90% for 10 frames
          const time = (percentage / 100) * duration
          const clampedTime = i === 0 ? 0.1 : Math.min(time, duration - 0.1) // Start at 0.1s, avoid end issues
          
          try {
            // Ensure video is paused before each capture
            videoElement.pause()
            const src = await captureFrame(videoElement, canvas, ctx, clampedTime)
            thumbs.push({ src, time: clampedTime })
          } catch (error) {
            console.warn(`Failed to generate thumbnail at ${clampedTime}s:`, error)
            // Create a placeholder thumbnail
            ctx.fillStyle = '#1a1a1a'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.fillStyle = '#666'
            ctx.font = '12px Arial'
            ctx.textAlign = 'center'
            ctx.fillText('Error', canvas.width / 2, canvas.height / 2)
            thumbs.push({ src: canvas.toDataURL(), time: clampedTime })
          }
          
          // Small delay between captures to prevent issues
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        
        // Restore original video state carefully
        videoElement.pause() // Ensure it's paused first
        videoElement.currentTime = originalTime
        
        // Wait a moment before potentially resuming playback
        await new Promise(resolve => setTimeout(resolve, 100))
        
        if (!originalPaused) {
          try {
            await videoElement.play()
          } catch (error) {
            console.warn('Could not resume video playback:', error)
          }
        }
        
        setThumbnails(thumbs)
        lastDurationRef.current = duration // Remember this duration
      } catch (error) {
        console.error('Failed to generate thumbnails:', error)
        setThumbnails([])
      } finally {
        setIsGenerating(false)
        generationPromiseRef.current = null
      }
    }

    generationPromiseRef.current = generateThumbnails()
  }, [videoElement, duration, thumbnailCount, isGenerating])

  return { thumbnails, isGenerating }
}

/**
 * Captures a single frame from video at specified time
 */
async function captureFrame(
  video: HTMLVideoElement, 
  canvas: HTMLCanvasElement, 
  ctx: CanvasRenderingContext2D, 
  time: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Ensure video is paused before seeking
    video.pause()
    
    const handleSeeked = () => {
      try {
        // Ensure video is still paused after seek
        video.pause()
        
        // Draw the current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        
        video.removeEventListener('seeked', handleSeeked)
        video.removeEventListener('error', handleError)
        video.removeEventListener('loadeddata', handleLoadedData)
        
        resolve(dataUrl)
      } catch (error) {
        video.removeEventListener('seeked', handleSeeked)
        video.removeEventListener('error', handleError)
        video.removeEventListener('loadeddata', handleLoadedData)
        reject(error)
      }
    }

    const handleLoadedData = () => {
      // Sometimes seeked doesn't fire, so we also listen for loadeddata
      handleSeeked()
    }

    const handleError = (error: Event) => {
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
      video.removeEventListener('loadeddata', handleLoadedData)
      reject(new Error('Video seek failed'))
    }

    // Add multiple event listeners to handle different browsers
    video.addEventListener('seeked', handleSeeked, { once: true })
    video.addEventListener('loadeddata', handleLoadedData, { once: true })
    video.addEventListener('error', handleError, { once: true })
    
    // Ensure video is paused and set the time
    video.pause()
    video.currentTime = time
    
    // Fallback timeout
    setTimeout(() => {
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
      video.removeEventListener('loadeddata', handleLoadedData)
      reject(new Error('Thumbnail generation timeout'))
    }, 2000) // Reduced timeout to 2 seconds
  })
} 