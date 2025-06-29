"""
Main script for Multi-Object Detection Pipeline

This script provides a simple interface to run both face and license plate detection
for the React video annotation project. It processes all videos in the videos directory
and outputs JSON annotations to the assets-json directory.
"""

import argparse
import sys
import os
from pathlib import Path

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Change to project root directory (parent of scripts directory)
project_root = Path(__file__).parent.parent
os.chdir(project_root)

from multi_detection import Detector, MultiObjectDetectionProcessor


def main():
    """Main function to run the multi-object detection pipeline."""
    
    parser = argparse.ArgumentParser(
        description="Process videos with YOLO face and license plate detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process all videos in the videos folder (default behavior)
  python main.py
  
  # Process all videos with custom confidence threshold
  python main.py --confidence 0.3
  
  # Process a specific video file
  python main.py --video videos/test.mp4
  
  # Use custom model paths
  python main.py --face-model yolo11m-face.pt --license-model custom-license.pt
        """
    )
    
    parser.add_argument(
        "--video", "-v",
        type=str,
        help="Path to a specific video file to process (default: process all videos in videos/ directory)"
    )
    
    parser.add_argument(
        "--confidence", "-c",
        type=float,
        default=0.25,
        help="Confidence threshold for detections (default: 0.25)"
    )
    
    parser.add_argument(
        "--face-model",
        type=str,
        default="scripts/yolo11n-face.pt",
        help="Path to face detection model (default: scripts/yolo11n-face.pt)"
    )
    
    parser.add_argument(
        "--license-model",
        type=str,
        default="scripts/license-plate-finetune-v1l.pt",
        help="Path to license plate detection model (default: scripts/license-plate-finetune-v1l.pt)"
    )
    parser.add_argument(
        "--videos-dir",
        type=str,
        default="videos",
        help="Directory containing video files (default: videos)"
    )
    
    parser.add_argument(
        "--output-dir",
        type=str,
        default="assets-json",
        help="Directory to save JSON annotation files (default: assets-json)"
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("Multi-Object Detection Pipeline (Face + License Plate)")
    print("="*60)
    
    # Check if models exist (only for local files)
    if args.face_model.startswith("scripts/") and not Path(args.face_model).exists():
        print(f"Warning: Face model not found at {args.face_model}")
    if args.license_model.startswith("scripts/") and not Path(args.license_model).exists():
        print(f"Warning: License plate model not found at {args.license_model}")
    
    # Set up detectors for both face and license plate detection
    detectors = [
        Detector(
            name="face",
            model_path=args.face_model,
            target_classes=["face"],
            conf=args.confidence
        ),
        Detector(
            name="license_plate",
            model_path=args.license_model,
            target_classes=[],  # Empty list means accept all classes
            conf=args.confidence
        ),
    ]
    
    # Initialize multi-object detection processor
    print("\nInitializing Multi-Object Detection Processor...")
    print(f"- Face detection model: {args.face_model}")
    print(f"- License plate detection model: {args.license_model}")
    print(f"- Confidence threshold: {args.confidence}")
    try:
        processor = MultiObjectDetectionProcessor(detectors)
        
        if args.video:
            # Process single video
            print(f"\nProcessing single video: {args.video}")
            
            video_path = Path(args.video)
            if not video_path.exists():
                print(f"Error: Video file not found: {args.video}")
                sys.exit(1)
            
            # Generate output filename
            output_file = Path(args.output_dir) / f"{video_path.stem}_annotations.json"
            
            processor.process_video(str(video_path), str(output_file))
            
        else:
            # Process all videos in the videos directory
            videos_dir = Path(args.videos_dir)
            
            # List available videos
            video_files = []
            if videos_dir.exists():
                video_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'}
                for ext in video_extensions:
                    video_files.extend(videos_dir.glob(f"*{ext}"))
                    video_files.extend(videos_dir.glob(f"*{ext.upper()}"))
            
            if video_files:
                print(f"\nFound {len(video_files)} video file(s) in {args.videos_dir}:")
                for i, video in enumerate(video_files, 1):
                    print(f"  {i}. {video.name}")
                
                print(f"\nStarting batch processing...")
                processor.process_sample_videos(args.videos_dir, args.output_dir)
            else:
                print(f"No video files found in {args.videos_dir}")
                return
        
        print("\n" + "="*60)
        print("Processing completed successfully!")
        print(f"JSON annotation files have been saved to the {args.output_dir} directory.")
        print("Annotations include both face and license plate detections with class labels.")
        print("You can now use these files in your React application.")
        
    except Exception as e:
        print(f"Error during processing: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()