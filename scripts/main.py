#!/usr/bin/env python3
"""
Main script for YOLO Face Detection Pipeline

This script provides a simple interface to run the face detection pipeline
for the React Native video annotation project.
"""

import sys
import os
from pathlib import Path

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from face_detection import FaceDetectionProcessor


def main():
    """Main function to run the face detection pipeline."""
    
    print("="*60)
    print("YOLO Face Detection Pipeline for Video Annotation")
    print("="*60)
    
    videos_dir = Path("../videos")
    
    # List available videos
    video_files = []
    if videos_dir.exists():
        video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'}
        for ext in video_extensions:
            video_files.extend(videos_dir.glob(f"*{ext}"))
            video_files.extend(videos_dir.glob(f"*{ext.upper()}"))
    
    if video_files:
        print(f"\nFound {len(video_files)} video file(s):")
        for i, video in enumerate(video_files, 1):
            print(f"  {i}. {video.name}")
    
    # Initialize face detection processor
    print("\nInitializing YOLO Face Detection Processor...")
    try:
        processor = FaceDetectionProcessor()
        
        # Process all videos
        print("\nStarting batch processing of all videos...")
        processor.process_sample_videos("../videos", "../assets-json")
        
        print("\n" + "="*60)
        print("Processing completed successfully!")
        print("JSON annotation files have been saved to the assets-json directory.")
        print("You can now use these files in your React application.")
        
    except Exception as e:
        print(f"Error during processing: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
