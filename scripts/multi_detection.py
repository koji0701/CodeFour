#!/usr/bin/env python3
"""
Multi-object detection video processor

This is the main pipeline
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
from ultralytics import YOLO


@dataclass
class Detector:
    """Configuration wrapper for one YOLO model."""

    name: str  # Logical name used in JSON (e.g. "face", "license_plate")
    model_path: str  # Local path or remote identifier understood by Ultralytics
    target_classes: List[str] = field(default_factory=list)  # Class names to keep
    conf: float = 0.25  # Confidence threshold
    device: Optional[str] = None  # e.g. "0" for CUDA device 0

    # Internal field (initialised in __post_init__)
    model: YOLO = field(init=False, repr=False)
    def __post_init__(self):
        print(f"Loading {self.name} model: {self.model_path}")
        if self.device is not None:
            print(f"  Using device: {self.device}")
        
        try:
            # Check if local file exists
            if self.model_path.endswith('.pt') and not os.path.exists(self.model_path):
                raise FileNotFoundError(f"Model file not found: {self.model_path}")
            
            self.model = YOLO(self.model_path, task="detect")
            
            if self.device is not None:
                self.model.to(self.device)
                
            print(f"Successfully loaded {self.name} model!")
            
        except Exception as exc:
            print(f"Failed to load model '{self.model_path}': {exc}")
            raise RuntimeError(f"Failed to load model '{self.model_path}': {exc}") from exc



class MultiObjectDetectionProcessor:
    """Run several YOLO detectors on a video and export a single JSON file."""

    def __init__(self, detectors: List[Detector]):
        if not detectors:
            raise ValueError("At least one Detector must be provided")
        self.detectors = detectors

    # ------------------------------------------------------------------
    # Core per-video processing
    # ------------------------------------------------------------------
    def process_video(self, video_path: str, output_path: Optional[str] = None) -> Dict[str, Any]:
        """Process *video_path* and (optionally) write annotations to *output_path*."""
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")

        fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30  # fallback to 30 if 0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps else 0

        print(f"Processing {video_path} — {width}x{height}, {fps} FPS, {frame_count} frames")

        data: Dict[str, Any] = {
            "video_info": {
                "filename": Path(video_path).name,
                "width": width,
                "height": height,
                "fps": fps,
                "frame_count": frame_count,
                "duration": duration,
            },
            "annotations": {},  # frame_number -> list[annotation]
        }

        frame_no = 0
        processed_frames = 0
        detection_counts = {det.name: 0 for det in self.detectors}

        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame_anns: List[Dict[str, Any]] = []

            # ----------------------------------------------------------
            # Run every detector on the current frame
            # ----------------------------------------------------------
            for det in self.detectors:
                try:
                    results = det.model(frame, conf=det.conf, verbose=False)
                except Exception as exc:
                    print(f"[WARN] {det.name}: error on frame {frame_no}: {exc}")
                    continue

                if not results:
                    continue

                for res in results:
                    boxes = getattr(res, "boxes", None)
                    if boxes is None or len(boxes) == 0:
                        continue

                    xyxy = boxes.xyxy.cpu().numpy()
                    confs = boxes.conf.cpu().numpy() if hasattr(boxes, "conf") else []
                    cls_idx = boxes.cls.cpu().numpy() if hasattr(boxes, "cls") else None

                    # Debug: Print available class names for this detector (only first frame)
                    if frame_no == 0 and hasattr(res, "names"):
                        available_classes = {idx: name for idx, name in res.names.items()}
                        # print(f"[DEBUG] {det.name} model classes: {available_classes}")
                    for i, box in enumerate(xyxy):
                        # Get detected class info
                        detected_class_name = det.name  # fallback to detector name
                        
                        if cls_idx is not None and hasattr(res, "names"):
                            detected_class_id = int(cls_idx[i])
                            detected_class_name = res.names.get(detected_class_id, f"class_{detected_class_id}")
                            
                            # # Debug: Print detected class (first few detections per detector)
                            # if detection_counts[det.name] < 5:
                            #     # print(f"[DEBUG] {det.name} detected class ID {detected_class_id}: '{detected_class_name}'")
                        
                        # For license plate detector, we already know it's detecting 'License_Plate' class
                        # Since we set target_classes=[] in main.py, we accept all detections
                        if det.target_classes:
                            # Only filter if target_classes is not empty
                            if detected_class_name not in det.target_classes:
                                continue
                        
                        # If we get here, we want to include this detection
                        x1, y1, x2, y2 = box[:4]
                        confidence = float(confs[i]) if i < len(confs) else 0.0

                        # Normalise [0..1]
                        x = float(max(0.0, min(1.0, x1 / width)))
                        y = float(max(0.0, min(1.0, y1 / height)))
                        w_norm = float(max(0.0, min(1.0 - x, (x2 - x1) / width)))
                        h_norm = float(max(0.0, min(1.0 - y, (y2 - y1) / height)))

                        frame_anns.append(
                            {
                                "id": f"{det.name}_{frame_no}_{len(frame_anns)}",
                                "x": x,
                                "y": y,
                                "width": w_norm,
                                "height": h_norm,
                                "confidence": confidence,
                                "type": "ai-generated",
                                "class": det.name,  # Use detector name for the class field
                            }
                        )
                        detection_counts[det.name] += 1
            if frame_anns:
                data["annotations"][frame_no] = frame_anns
                processed_frames += 1

            frame_no += 1
            if frame_no % 30 == 0:
                progress = frame_no / frame_count * 100 if frame_count else 0
                print(f"Progress: {progress:.1f}% ({frame_no}/{frame_count})")

        cap.release()
        
        # Print detection summary
        print(f"Detection finished: {frame_no} frames processed, detections in {processed_frames} frames")
        for det_name, count in detection_counts.items():
            print(f"  - {det_name}: {count} detections")
        
        total_detections = sum(len(v) for v in data["annotations"].values())
        print(f"Total annotations: {total_detections}")

        if output_path:
            self._save_annotations(data, output_path)

        return data
    def _save_annotations(self, annotations: Dict[str, Any], output_path: str):
        """Save annotations to a JSON file."""
        try:
            # Create output directory if it doesn't exist
            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
            
            with open(output_path, 'w') as f:
                json.dump(annotations, f, indent=2)
            print(f"Annotations saved to: {output_path}")
        except Exception as e:
            print(f"Error saving annotations: {e}")