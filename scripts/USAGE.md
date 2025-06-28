# Quick Usage Guide

## Getting Started

1. **Install dependencies:**
   ```bash
   cd scripts
   uv sync
   source .venv/bin/activate
   ```

2. **Run the complete pipeline:**
   ```bash
   python main.py
   ```

## Individual Scripts

### Basic Face Detection
```bash
# Single video
python face_detection.py --video ../videos/sample.mp4

# All videos
python face_detection.py --batch

# Custom settings
python face_detection.py --video sample.mp4 --confidence 0.3 --model yolo11m.pt
```

### Advanced Face Detection
```bash
# With frame sampling (faster)
python advanced_face_detection.py --video sample.mp4 --sample-rate 3

# With size filtering
python advanced_face_detection.py --video sample.mp4 --min-face-size 0.02

# With debug visualization
python advanced_face_detection.py --video sample.mp4 --debug
```

## Output

- **JSON files**: Saved to `../assets-json/`
- **Debug videos**: Saved alongside original videos (when using `--debug`)
- **Format**: Compatible with React Native video annotation app

## Tips

- Use `--confidence 0.1` for more detections (may include false positives)
- Use `--sample-rate 3` to speed up processing by 3x
- Use `--debug` to visualize detections (creates annotated video)
- Check file sizes: larger models (yolo11m.pt, yolo11l.pt) are more accurate but slower 