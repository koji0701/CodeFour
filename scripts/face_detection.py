#!/usr/bin/env python3
"""
YOLO Face Detection Video Processor

This script processes video files to detect faces using YOLO models and exports
the detection results to JSON format for use in the React video annotation app.

Usage:
    python face_detection.py --video path/to/video.mp4 --output annotations.json
    python face_detection.py --video path/to/video.mp4 --model yolo11n.pt --confidence 0.5
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional
import cv2
import numpy as np
from ultralytics import YOLO


class FaceDetectionProcessor:
    """
    Processes videos using YOLO models to detect faces and export annotations.
    """
    
    def __init__(self, model_path: str = "scripts/yolo11n-face.pt", confidence: float = 0.25, target_classes: Optional[List[str]] = None):
        """
        Initialize the face detection processor.
        
        Args:
            model_path: Path to the YOLO model file
            confidence: Confidence threshold for detections
            target_classes: List of class names to keep from YOLO detections (defaults to ["face"])
        """
        self.confidence = confidence
        self.model_path = model_path
        # Keep only these class names when parsing detections. Defaults to just "face".
        self.target_classes = set(target_classes or ["face"])
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load the YOLO model."""
        try:
            print(f"Loading YOLO model: {self.model_path}")
            self.model = YOLO(self.model_path)
            print("Model loaded successfully!")
        except Exception as e:
            print(f"Error loading model: {e}")
            sys.exit(1)
    
    def process_video(self, video_path: str, output_path: str = None) -> Dict[str, Any]:
        """
        Process a video file to detect faces and generate annotations.
        
        Args:
            video_path: Path to the input video file
            output_path: Path to save the JSON output (optional)
            
        Returns:
            Dictionary containing video info and frame annotations
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        print(f"Processing video: {video_path}")
        
        # Open video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")
        
        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0
        
        print(f"Video properties: {width}x{height}, {fps} FPS, {frame_count} frames, {duration:.2f}s")
        
        # Initialize result structure
        output_data = {
            "video_info": {
                "filename": os.path.basename(video_path),
                "width": width,
                "height": height,
                "fps": fps,
                "frame_count": frame_count,
                "duration": duration
            },
            "annotations": {}
        }
        
        frame_number = 0
        processed_frames = 0
        
        print("Starting face detection...")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Run YOLO inference
            try:
                results = self.model(frame, conf=self.confidence, verbose=False)
                
                # Process detections for this frame
                frame_annotations = []
                if results and len(results) > 0:
                    for result in results:
                        if result.boxes is not None and len(result.boxes) > 0:
                            boxes = result.boxes
                            
                            # Check if we have boxes data
                            if hasattr(boxes, 'xyxy') and boxes.xyxy is not None and len(boxes.xyxy) > 0:
                                # Get coordinates and confidence values
                                xyxy = boxes.xyxy.cpu().numpy()
                                conf = boxes.conf.cpu().numpy() if hasattr(boxes, 'conf') and boxes.conf is not None else []
                                
                                # Retrieve class indices for each detection (if available)
                                cls_indices = (
                                    boxes.cls.cpu().numpy()
                                    if hasattr(boxes, 'cls') and boxes.cls is not None
                                    else None
                                )
                                
                                # Ensure we have matching number of boxes and confidences
                                num_detections = min(len(xyxy), len(conf)) if len(conf) > 0 else len(xyxy)
                                
                                # Process each detection
                                for i in range(num_detections):
                                    # Filter by allowed classes first (if cls information is present)
                                    if cls_indices is not None and hasattr(result, 'names'):
                                        class_name = result.names.get(int(cls_indices[i]), "")
                                        if self.target_classes and class_name not in self.target_classes:
                                            # Skip any detection not in the allowed class list
                                            continue
                                    try:
                                        # Get bounding box coordinates (xyxy format)
                                        if len(xyxy[i]) >= 4:
                                            x1, y1, x2, y2 = xyxy[i][:4]
                                            confidence = float(conf[i]) if len(conf) > i else 0.5
                                            
                                            # Convert to x, y, width, height format and normalize coordinates
                                            x = float(x1) / width
                                            y = float(y1) / height
                                            w = float(x2 - x1) / width
                                            h = float(y2 - y1) / height
                                            
                                            # Ensure coordinates are within bounds
                                            x = max(0, min(1, x))
                                            y = max(0, min(1, y))
                                            w = max(0, min(1-x, w))
                                            h = max(0, min(1-y, h))
                                            
                                            annotation = {
                                                "id": f"face_{frame_number}_{i}",
                                                "x": x,
                                                "y": y,
                                                "width": w,
                                                "height": h,
                                                "confidence": confidence,
                                                "type": "ai-generated",
                                                "class": "face"
                                            }
                                            frame_annotations.append(annotation)
                                    except Exception as box_error:
                                        print(f"Error processing box {i} in frame {frame_number}: {box_error}")
                                        continue
                            
            except Exception as frame_error:
                print(f"Error processing frame {frame_number}: {frame_error}")
                # Continue to next frame
                frame_number += 1
                continue
            
            # Store annotations for this frame (only if there are detections)
            if frame_annotations:
                output_data["annotations"][frame_number] = frame_annotations
                processed_frames += 1
            
            frame_number += 1
            
            # Progress indicator
            if frame_number % 30 == 0:  # Every 30 frames
                progress = (frame_number / frame_count) * 100
                print(f"Progress: {progress:.1f}% ({frame_number}/{frame_count} frames)")
        
        cap.release()
        
        print(f"Face detection completed!")
        print(f"Processed {frame_number} frames, found faces in {processed_frames} frames")
        print(f"Total face detections: {sum(len(annotations) for annotations in output_data['annotations'].values())}")
        
        # Save to JSON file if output path is provided
        if output_path:
            self._save_annotations(output_data, output_path)
        
        return output_data
    
    def _save_annotations(self, annotations: Dict[str, Any], output_path: str):
        """
        Save annotations to a JSON file.
        
        Args:
            annotations: The annotations dictionary to save
            output_path: Path to save the JSON file
        """
        try:
            # Create output directory if it doesn't exist
            output_dir = os.path.dirname(output_path)
            if output_dir:  # Only create directory if there is a directory part
                os.makedirs(output_dir, exist_ok=True)
            
            with open(output_path, 'w') as f:
                json.dump(annotations, f, indent=2)
            print(f"Annotations saved to: {output_path}")
        except Exception as e:
            print(f"Error saving annotations: {e}")
            print(f"Output path was: '{output_path}'")
    
    def process_sample_videos(self, videos_dir: str = "videos", output_dir: str = "assets-json"):
        """
        Process all video files in the videos directory and save annotations.
        
        Args:
            videos_dir: Directory containing video files
            output_dir: Directory to save JSON annotation files
        """
        videos_path = Path(videos_dir)
        output_path = Path(output_dir)
        
        if not videos_path.exists():
            print(f"Videos directory not found: {videos_dir}")
            return
        
        # Create output directory
        output_path.mkdir(exist_ok=True)
        
        # Supported video extensions
        video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'}
        
        # Find all video files
        video_files = []
        for ext in video_extensions:
            video_files.extend(videos_path.glob(f"*{ext}"))
            video_files.extend(videos_path.glob(f"*{ext.upper()}"))
        
        if not video_files:
            print(f"No video files found in {videos_dir}")
            print("Supported formats: {', '.join(video_extensions)}")
            return
        
        print(f"Found {len(video_files)} video file(s) to process")
        
        for video_file in video_files:
            print(f"\n{'='*50}")
            
            # Generate output filename
            output_file = output_path / f"{video_file.stem}_annotations.json"
            
            try:
                self.process_video(str(video_file), str(output_file))
            except Exception as e:
                print(f"Error processing {video_file}: {e}")
                continue
        
        print(f"\n{'='*50}")
        print("Batch processing completed!")


def main():
    """Main function to handle command line arguments and run face detection."""
    parser = argparse.ArgumentParser(
        description="Process videos with YOLO face detection and export annotations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process a single video
  python face_detection.py --video sample.mp4 --output annotations.json
  
  # Process with custom model and confidence
  python face_detection.py --video sample.mp4 --model yolo11m.pt --confidence 0.5
  
  # Process all videos in the videos folder
  python face_detection.py --batch
  
  # Use a specific YOLO model for face detection
  python face_detection.py --batch --model yolo11n.pt
        """
    )
    
    parser.add_argument(
        "--video", "-v",
        type=str,
        help="Path to the video file to process"
    )
    
    parser.add_argument(
        "--output", "-o",
        type=str,
        help="Path to save the JSON annotations file"
    )
    
    parser.add_argument(
        "--model", "-m",
        type=str,
        default="scripts/yolo11n-face.pt",
        help="Path to YOLO model file (default: yolo11n-face.pt)"
    )
    
    parser.add_argument(
        "--confidence", "-c",
        type=float,
        default=0.25,
        help="Confidence threshold for detections (default: 0.25)"
    )
    
    parser.add_argument(
        "--batch", "-b",
        action="store_true",
        help="Process all videos in the videos folder"
    )
    
    parser.add_argument(
        "--videos-dir",
        type=str,
        default="videos",
        help="Directory containing video files for batch processing (default: videos)"
    )
    
    parser.add_argument(
        "--output-dir",
        type=str,
        default="assets-json",
        help="Directory to save JSON files for batch processing (default: assets-json)"
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.batch and not args.video:
        parser.error("Either --video or --batch must be specified")
    
    if args.batch and args.video:
        parser.error("Cannot use both --video and --batch options")
    
    if args.video and not args.output:
        # Generate default output filename
        video_path = Path(args.video)
        args.output = f"assets-json/{video_path.stem}_annotations.json"    
    # Initialize processor
    print("Initializing YOLO Face Detection Processor...")
    processor = FaceDetectionProcessor(
        model_path=args.model,
        confidence=args.confidence
    )
    
    try:
        if args.batch:
            # Process all videos in the videos directory
            processor.process_sample_videos(args.videos_dir, args.output_dir)
        else:
            # Process single video
            processor.process_video(args.video, args.output)
            
    except Exception as e:
        import traceback
        print(f"Error: {e}")
        print("Full traceback:")
        traceback.print_exc()
        sys.exit(1)



if __name__ == "__main__":
    main() 