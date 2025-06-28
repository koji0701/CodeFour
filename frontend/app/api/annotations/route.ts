import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'
import type { AnnotationData } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const data: AnnotationData = await request.json()
    
    // Write to the public annotations file
    const filePath = path.join(process.cwd(), 'public', 'annotations', 'test_annotations.json')
    
    await writeFile(filePath, JSON.stringify(data, null, 2))
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save annotations:', error)
    return NextResponse.json(
      { error: 'Failed to save annotations' },
      { status: 500 }
    )
  }
} 