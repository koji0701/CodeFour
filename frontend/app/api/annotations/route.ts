import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile } from 'fs/promises'
import path from 'path'
import type { AnnotationData } from '@/lib/types'

// Store the annotations file outside of the Next.js `frontend` directory so that
// changes to the file don't trigger the dev server's file-watcher and force a
// full page refresh.

const annotationsFilePath = path.join(process.cwd(), '..', 'assets-json', 'face_license_test_annotations.json')

export async function GET() {
  try {
    const file = await readFile(annotationsFilePath, 'utf8')
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('Failed to read annotations:', error)
    return NextResponse.json(
      { error: 'Failed to read annotations' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: AnnotationData = await request.json()
    
    await writeFile(annotationsFilePath, JSON.stringify(data, null, 2))
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save annotations:', error)
    return NextResponse.json(
      { error: 'Failed to save annotations' },
      { status: 500 }
    )
  }
} 