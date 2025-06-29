"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react"
import type { AnnotationData } from "@/lib/types"

interface JsonLoaderProps {
  onJsonLoad: (data: AnnotationData) => void
}

export default function JsonLoader({ onJsonLoad }: JsonLoaderProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAnnotations = async () => {
    setIsLoading(true)
    setError(null)
    
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
      
      onJsonLoad(data)
      setIsLoaded(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load annotation data'
      setError(errorMessage)
      console.error('Error loading annotations:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-load annotations on component mount
  useEffect(() => {
    loadAnnotations()
  }, [])

  return (
    <Card className="p-4 border-gray-600">
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4" />
          <span className="font-medium">Annotation Data</span>
        </div>
        
        <div className="flex items-center space-x-2">
          {isLoading && (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-gray-300">Loading annotations...</span>
            </>
          )}
          
          {isLoaded && !error && (
            <>
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Annotations loaded successfully</span>
            </>
          )}
          
          {error && (
            <>
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-red-400">Error: {error}</span>
            </>
          )}
        </div>
        
        {(error || !isLoaded) && (
          <Button
            onClick={loadAnnotations}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="w-full bg-gray-700 border-gray-600 hover:bg-gray-600"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Load Annotations'
            )}
          </Button>
        )}
      </div>
    </Card>
  )
}