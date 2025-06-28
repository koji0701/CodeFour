#!/usr/bin/env python3
"""
Advanced YOLO Face Detection Script

This script demonstrates advanced face detection capabilities including:
- Support for specialized face detection models
- Frame sampling for performance optimization
- Advanced filtering and post-processing
- Better visualization and debugging options

Usage:
    python advanced_face_detection.py --video path/to/video.mp4 --face-model yolov8n-face.pt
    python advanced_face_detection.py --batch --sample-rate 5 --min-face-size 0.02
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

from face_detection import FaceDetectionProcessor


class AdvancedFaceDetectionProcessor(FaceDetectionProcessor):
    """
    Advanced face detection processor with additional features for better performance
    and accuracy in face detection tasks.
    """
    
    def __init__(self, 
                 model_path: str = "yolo11n.pt", 
                 confidence: float = 0.25,
                 sample_rate: int = 1,
                 min_face_size: float = 0.01,
                 max_face_size: float = 1.0,
                 nms_threshold: float = 0.45):
        """
        Initialize the advanced face detection processor.
        
        Args:
            model_path: Path to the YOLO model file
            confidence: Confidence threshold for detections
            sample_rate: Process every Nth frame (1 = every frame, 2 = every other frame)
            min_face_size: Minimum face size as fraction of image area
            max_face_size: Maximum face size as fraction of image area
            nms_threshold: Non-maximum suppression threshold
        """
        super().__init__(model_path, confidence)
        self.sample_rate = sample_rate
        self.min_face_size = min_face_size
        self.max_face_size = max_face_size
        self.nms_threshold = nms_threshold
        
    def _filter_detections(self, annotations: List[Dict], width: int, height: int) -> List[Dict]:
        """
        Filter detections based on size and other criteria.
        
        Args:
            annotations: List of detection annotations
            width: Video width in pixels
            height: Video height in pixels
            
        Returns:
            Filtered list of annotations
        """
        filtered = []
        
        for annotation in annotations:
            # Calculate actual face area
            face_area = annotation['width'] * annotation['height']
            
            # Filter by size
            if face_area < self.min_face_size or face_area > self.max_face_size:
                continue
                
            # Filter by aspect ratio (faces should be roughly square-ish)
            aspect_ratio = annotation['width'] / annotation['height']
            if aspect_ratio < 0.5 or aspect_ratio > 2.0:
                continue
                
            # Additional filtering can be added here
            # e.g., position filtering, temporal consistency, etc.
            
            filtered.append(annotation)
            
        return filtered
    
    def process_video(self, video_path: str, output_path: str = None, 
                     enable_debug: bool = False) -> Dict[str, Any]:
        """
        Process a video file with advanced face detection features.
        
        Args:
            video_path: Path to the input video file
            output_path: Path to save the JSON output (optional)
            enable_debug: Enable debug visualization
            
        Returns:
            Dictionary containing video info and frame annotations
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        print(f"Processing video: {video_path}")
        print(f"Advanced settings: sample_rate={self.sample_rate}, min_face_size={self.min_face_size}")
        
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
                "duration": duration,
                "processing_settings": {
                    "model": self.model_path,
                    "confidence": self.confidence,
                    "sample_rate": self.sample_rate,
                    "min_face_size": self.min_face_size,
                    "max_face_size": self.max_face_size,
                    "nms_threshold": self.nms_threshold
                }
            },
            "annotations": {},
            "statistics": {
                "frames_processed": 0,
                "frames_with_faces": 0,
                "total_detections": 0,
                "avg_faces_per_frame": 0.0,
                "processing_time": 0.0
            }
        }
        
        frame_number = 0
        processed_frames = 0
        total_detections = 0
        
        print("Starting advanced face detection...")
        
        # Setup debug visualization if enabled
        debug_writer = None
        if enable_debug:
            debug_output = f"{os.path.splitext(video_path)[0]}_debug.mp4"
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            debug_writer = cv2.VideoWriter(debug_output, fourcc, fps, (width, height))
            print(f"Debug video will be saved to: {debug_output}")
        
        import time
        start_time = time.time()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Sample frames based on sample_rate
            if frame_number % self.sample_rate == 0:
                try:
                    # Run YOLO inference
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
                                    
                                    # Ensure we have matching number of boxes and confidences
                                    num_detections = min(len(xyxy), len(conf)) if len(conf) > 0 else len(xyxy)
                                    
                                    # Process each detection
                                    for i in range(num_detections):
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
                    
                    # Apply advanced filtering
                    frame_annotations = self._filter_detections(frame_annotations, width, height)
                    
                    # Draw debug visualization if enabled
                    if enable_debug and debug_writer:
                        debug_frame = frame.copy()
                        for annotation in frame_annotations:
                            x1 = int(annotation['x'] * width)
                            y1 = int(annotation['y'] * height)
                            x2 = int((annotation['x'] + annotation['width']) * width)
                            y2 = int((annotation['y'] + annotation['height']) * height)
                            
                            # Draw bounding box
                            cv2.rectangle(debug_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            
                            # Draw confidence score
                            conf_text = f"{annotation['confidence']:.2f}"
                            cv2.putText(debug_frame, conf_text, (x1, y1-10), 
                                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                        
                        # Add frame info
                        cv2.putText(debug_frame, f"Frame: {frame_number}", (10, 30), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                        cv2.putText(debug_frame, f"Faces: {len(frame_annotations)}", (10, 60), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                        
                        debug_writer.write(debug_frame)
                    
                    # Store annotations for this frame (only if there are detections)
                    if frame_annotations:
                        output_data["annotations"][frame_number] = frame_annotations
                        processed_frames += 1
                        total_detections += len(frame_annotations)
                        
                except Exception as frame_error:
                    print(f"Error processing frame {frame_number}: {frame_error}")
            
            frame_number += 1
            
            # Progress indicator
            if frame_number % (30 * self.sample_rate) == 0:  # Adjust for sample rate
                progress = (frame_number / frame_count) * 100
                print(f"Progress: {progress:.1f}% ({frame_number}/{frame_count} frames)")
        
        cap.release()
        if debug_writer:
            debug_writer.release()
        
        # Calculate statistics
        processing_time = time.time() - start_time
        avg_faces = total_detections / processed_frames if processed_frames > 0 else 0
        
        output_data["statistics"].update({
            "frames_processed": processed_frames,
            "frames_with_faces": processed_frames,
            "total_detections": total_detections,
            "avg_faces_per_frame": avg_faces,
            "processing_time": processing_time
        })
        
        print(f"Advanced face detection completed!")
        print(f"Processed {frame_number} frames (sampled every {self.sample_rate})")
        print(f"Found faces in {processed_frames} frames")
        print(f"Total face detections: {total_detections}")
        print(f"Average faces per frame: {avg_faces:.2f}")
        print(f"Processing time: {processing_time:.2f} seconds")
        
        # Save to JSON file if output path is provided
        if output_path:
            self._save_annotations(output_data, output_path)
        
        return output_data


def main():
    """Main function for advanced face detection."""
    parser = argparse.ArgumentParser(
        description="Advanced YOLO face detection with specialized features",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Advanced face detection with sampling
  python advanced_face_detection.py --video sample.mp4 --sample-rate 3
  
  # Use specialized face detection model
  python advanced_face_detection.py --video sample.mp4 --face-model yolov8n-face.pt
  
  # Process with strict size filtering and debug output
  python advanced_face_detection.py --video sample.mp4 --min-face-size 0.02 --debug
  
  # Batch processing with advanced settings
  python advanced_face_detection.py --batch --sample-rate 5 --confidence 0.4
        """
    )
    
    parser.add_argument("--video", "-v", type=str, help="Path to the video file to process")
    parser.add_argument("--output", "-o", type=str, help="Path to save the JSON annotations file")
    parser.add_argument("--face-model", "-fm", type=str, default="yolo11n.pt", help="Path to face detection YOLO model")
    parser.add_argument("--confidence", "-c", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--sample-rate", "-sr", type=int, default=1, help="Process every Nth frame (default: 1)")
    parser.add_argument("--min-face-size", type=float, default=0.01, help="Minimum face size (fraction of image)")
    parser.add_argument("--max-face-size", type=float, default=1.0, help="Maximum face size (fraction of image)")
    parser.add_argument("--nms-threshold", type=float, default=0.45, help="Non-maximum suppression threshold")
    parser.add_argument("--batch", "-b", action="store_true", help="Process all videos in videos folder")
    parser.add_argument("--debug", "-d", action="store_true", help="Enable debug visualization")
    parser.add_argument("--videos-dir", type=str, default="../videos", help="Videos directory")
    parser.add_argument("--output-dir", type=str, default="../assets-json", help="Output directory")
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.batch and not args.video:
        parser.error("Either --video or --batch must be specified")
    
    if args.video and not args.output:
        video_path = Path(args.video)
        args.output = f"{video_path.stem}_advanced_annotations.json"
    
    # Initialize advanced processor
    print("Initializing Advanced YOLO Face Detection Processor...")
    processor = AdvancedFaceDetectionProcessor(
        model_path=args.face_model,
        confidence=args.confidence,
        sample_rate=args.sample_rate,
        min_face_size=args.min_face_size,
        max_face_size=args.max_face_size,
        nms_threshold=args.nms_threshold
    )
    
    try:
        if args.batch:
            # Process all videos in the videos directory
            # Note: For batch processing, debug is disabled to avoid creating too many files
            videos_path = Path(args.videos_dir)
            output_path = Path(args.output_dir)
            
            if not videos_path.exists():
                print(f"Videos directory not found: {args.videos_dir}")
                return
            
            output_path.mkdir(exist_ok=True)
            video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'}
            
            video_files = []
            for ext in video_extensions:
                video_files.extend(videos_path.glob(f"*{ext}"))
                video_files.extend(videos_path.glob(f"*{ext.upper()}"))
            
            if not video_files:
                print(f"No video files found in {args.videos_dir}")
                return
            
            print(f"Found {len(video_files)} video file(s) to process")
            
            for video_file in video_files:
                print(f"\n{'='*50}")
                output_file = output_path / f"{video_file.stem}_advanced_annotations.json"
                
                try:
                    processor.process_video(str(video_file), str(output_file), enable_debug=False)
                except Exception as e:
                    print(f"Error processing {video_file}: {e}")
                    continue
        else:
            # Process single video
            processor.process_video(args.video, args.output, enable_debug=args.debug)
            
    except Exception as e:
        import traceback
        print(f"Error: {e}")
        print("Full traceback:")
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main() 