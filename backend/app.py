from flask import Flask, jsonify, request, send_from_directory, make_response
from flask_cors import CORS
import os
import time
import cv2
import numpy as np
import torch
import hashlib
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from segment_anything import sam_model_registry, SamPredictor
from ultralytics import YOLO
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
import torch.nn as nn
import fitz # PyMuPDF
import pytesseract
import re
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash

# ==========================================
# TESSERACT CONFIGURATION (WINDOWS)
# ==========================================
if os.name == 'nt':
    # Common installation paths for Tesseract on Windows
    common_paths = [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Tesseract-OCR', 'tesseract.exe'),
    ]
    for path in common_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            break

# ==========================================
# CONFIGURATION & DATABASE
# ==========================================
app = Flask(__name__)
# Robust CORS configuration
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

DATABASE = 'users.db'
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# ==========================================
# DATABASE SETUP
# ==========================================
def init_db():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            mobile TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

with app.app_context():
    init_db()

# Global model instances
sam_predictor = None
yolo_model = None
scene_processor = None
scene_model = None

# Cache for performance
wall_cache = {}

# Mock Room Data
ROOMS = [
    {'id': 'living-room', 'name': 'Living Room', 'image': 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=800'},
    {'id': 'bedroom', 'name': 'Bedroom', 'image': 'https://images.unsplash.com/photo-1616594111350-47598ff1f61a?w=800'},
    {'id': 'kitchen', 'name': 'Kitchen', 'image': 'https://images.unsplash.com/photo-1556911223-05345a3068e4?w=800'},
    {'id': 'office', 'name': 'Office', 'image': 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800'}
]

def load_models():
    """Load all AI models once at startup for stability and performance."""
    global sam_predictor, yolo_model, scene_processor, scene_model
    
    print("--- Initializing AI Models ---", flush=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using Device: {device}", flush=True)

    # 1. SAM
    sam_checkpoint = "sam_vit_b_01ec64.pth"
    if not os.path.exists(sam_checkpoint):
        print("Downloading SAM model...", flush=True)
        import urllib.request
        url = "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth"
        urllib.request.urlretrieve(url, sam_checkpoint)
    
    sam = sam_model_registry["vit_b"](checkpoint=sam_checkpoint)
    sam.to(device)
    sam_predictor = SamPredictor(sam)
    print("✓ SAM Loaded", flush=True)

    # 2. YOLOv8
    yolo_model = YOLO("yolov8n-seg.pt")
    yolo_model.to(device)
    print("✓ YOLOv8 Loaded", flush=True)

    # 3. SegFormer (Scene Understanding)
    model_id = "nvidia/segformer-b0-finetuned-ade-512-512"
    scene_processor = SegformerImageProcessor.from_pretrained(model_id)
    scene_model = SegformerForSemanticSegmentation.from_pretrained(model_id)
    scene_model.to(device)
    scene_model.eval()
    print("✓ SegFormer Loaded", flush=True)
    print("--- All Models Ready ---", flush=True)

# ==========================================
# GENERAL DATA ROUTES
# ==========================================

# ==========================================
# GENERAL DATA ROUTES
# ==========================================

@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    return jsonify(ROOMS)

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    if 'pdf_file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['pdf_file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    # Clear previous pages
    pages_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'pages')
    if not os.path.exists(pages_dir):
        os.makedirs(pages_dir)
    else:
        for f in os.listdir(pages_dir):
            try:
                os.remove(os.path.join(pages_dir, f))
            except: pass

    pdf_name = f"pdf_{int(time.time())}.pdf"
    pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], pdf_name)
    file.save(pdf_path)

    # Convert PDF to images
    try:
        doc = fitz.open(pdf_path)
        page_urls = []
        for i in range(len(doc)):
            page = doc.load_page(i)
            pix = page.get_pixmap()
            img_name = f"page_{i}.png"
            img_path = os.path.join(pages_dir, img_name)
            pix.save(img_path)
            page_urls.append(f"http://localhost:5000/uploads/pages/{img_name}")
        
        doc.close()
        return jsonify({'success': True, 'pages': page_urls, 'pdf_path': pdf_name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pages', methods=['GET'])
def get_pages():
    pages_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'pages')
    if not os.path.exists(pages_dir):
        return jsonify([])
    
    try:
        pages = [f for f in os.listdir(pages_dir) if f.endswith('.png')]
        pages.sort(key=lambda x: int(x.split('_')[1].split('.')[0]))
        urls = [f"http://localhost:5000/uploads/pages/{p}" for p in pages]
        return jsonify(urls)
    except:
        return jsonify([])

@app.route('/api/crop', methods=['POST'])
def crop_image():
    data = request.json
    page_url = data.get('page_url')
    x = data.get('x')
    y = data.get('y')
    width = data.get('width')
    height = data.get('height')
    scale_x = data.get('scale_x', 1.0)
    scale_y = data.get('scale_y', 1.0)
    
    if not all([page_url, x is not None, y is not None, width, height]):
        return jsonify({'error': 'Missing coordinates'}), 400
    
    # Get local path from URL
    parts = page_url.split('/')
    img_name = parts[-1]
    img_path = os.path.join(app.config['UPLOAD_FOLDER'], 'pages', img_name)
    
    if not os.path.exists(img_path):
        return jsonify({'error': 'Page not found'}), 404
    
    image = cv2.imread(img_path)
    if image is None:
        return jsonify({'error': 'Could not read image'}), 500
        
    # x, y, width, height are now expected in REAL PIXELS from frontend
    real_x = int(x)
    real_y = int(y)
    real_w = int(width)
    real_h = int(height)
    
    # Ensure they are within bounds
    ih, iw = image.shape[:2]
    real_x = max(0, min(real_x, iw - 1))
    real_y = max(0, min(real_y, ih - 1))
    real_w = max(1, min(real_w, iw - real_x))
    real_h = max(1, min(real_h, ih - real_y))
    
    # RAW CROP: No processing, no filters, just pixel-perfect extraction
    cropped = image[real_y:real_y+real_h, real_x:real_x+real_w]
    
    filters_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'filters')
    if not os.path.exists(filters_dir):
        os.makedirs(filters_dir)
    
    crop_name = f"crop_{int(time.time())}.png"
    crop_path = os.path.join(filters_dir, crop_name)
    cv2.imwrite(crop_path, cropped) # Saved exactly as in PDF
    
    return jsonify({
        'success': True, 
        'image_path': f"uploads/filters/{crop_name}",
        'url': f"http://localhost:5000/uploads/filters/{crop_name}"
    })

@app.route('/api/save-filter', methods=['POST'])
def save_filter():
    data = request.json
    image_path = data.get('image_path')
    code = data.get('code')
    
    if not image_path or not code:
        return jsonify({'error': 'Missing path or code'}), 400
    
    with sqlite3.connect(DATABASE) as conn:
        conn.execute('INSERT INTO filters (image_path, code) VALUES (?, ?)', (image_path, code))
        conn.commit()
    
    return jsonify({'success': True})

@app.route('/api/filters', methods=['GET'])
def get_filters():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.execute('SELECT id, image_path, code, created_at FROM filters ORDER BY created_at DESC')
        rows = cursor.fetchall()
    
    filters = []
    for row in rows:
        filters.append({
            'id': row[0],
            'image_path': row[1],
            'url': f"http://localhost:5000/{row[1]}",
            'code': row[2],
            'created_at': row[3]
        })
    return jsonify(filters)

@app.route('/api/extracted-textures', methods=['GET'])
def get_extracted_textures():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.execute('SELECT id, image_path, code FROM filters ORDER BY created_at DESC')
        rows = cursor.fetchall()
    
    textures = []
    for row in rows:
        textures.append({
            'id': str(row[0]),
            'name': row[2],
            'url': f"http://localhost:5000/{row[1]}"
        })
    return jsonify(textures)

@app.route('/api/products', methods=['GET'])
def get_products():
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.execute('SELECT id, image_path, code FROM filters ORDER BY created_at DESC')
        rows = cursor.fetchall()
    
    products = []
    for row in rows:
        products.append({
            'id': row[0],
            'name': row[2],
            'image': f"http://localhost:5000/{row[1]}",
            'preview': f"http://localhost:5000/{row[1]}",
            'type': 'wall',
            'color': '#ffffff',
            'pattern': f"http://localhost:5000/{row[1]}"
        })
    return jsonify(products)

@app.route('/api/filter', methods=['DELETE'])
def delete_filter():
    id = request.args.get('id')
    if not id:
        return jsonify({'error': 'Missing ID'}), 400
    
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.execute('SELECT image_path FROM filters WHERE id = ?', (id,))
        row = cursor.fetchone()
        if row:
            image_path = row[0]
            full_path = os.path.join(os.getcwd(), image_path) # Assume it's relative to root
            if os.path.exists(full_path):
                try: os.remove(full_path)
                except: pass
            conn.execute('DELETE FROM filters WHERE id = ?', (id,))
            conn.commit()
            return jsonify({'success': True})
    return jsonify({'error': 'Filter not found'}), 404

@app.route('/api/detect-codes', methods=['POST'])
def detect_codes():
    data = request.json
    page_url = data.get('page_url')
    
    if not page_url:
        return jsonify({'error': 'Missing page_url'}), 400
        
    parts = page_url.split('/')
    img_name = parts[-1]
    img_path = os.path.join(app.config['UPLOAD_FOLDER'], 'pages', img_name)
    
    if not os.path.exists(img_path):
        return jsonify({'error': 'Page not found'}), 404
        
    image = cv2.imread(img_path)
    if image is None:
        return jsonify({'error': 'Could not read image file'}), 500
        
    try:
        # Multi-step preprocessing for better OCR
        # Scale up for better small text detection
        h, w = image.shape[:2]
        image_scaled = cv2.resize(image, (w*2, h*2), interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(image_scaled, cv2.COLOR_BGR2GRAY)
        
        # Noise reduction
        gray = cv2.bilateralFilter(gray, 9, 75, 75)
        
        # Try different thresholds
        _, thresh1 = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)
        _, thresh2 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        _, thresh3 = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
        
        detected = []
        def normalize_code(text):
            return normalize_code(text)

        def extract_from_img(img_data, scale=2):
            try:
                d = pytesseract.image_to_data(img_data, output_type=pytesseract.Output.DICT)
                found = []
                # Flexible regex for WK codes: WK followed by numbers, optional spaces, optional dash, numbers
                wk_pattern = re.compile(r'WK\d+\s*[-–—]?\s*\d+', re.IGNORECASE)
                
                for i in range(len(d['text'])):
                    text = d['text'][i].strip()
                    if not text: continue
                    
                    match = wk_pattern.search(text)
                    if match:
                        code = normalize_code(match.group(0)).upper()
                        # Scale coordinates back to original size
                        left = int(d['left'][i] / scale)
                        top = int(d['top'][i] / scale)
                        width = int(d['width'][i] / scale)
                        height = int(d['height'][i] / scale)
                        found.append({
                            'code': code,
                            'left': left,
                            'top': top,
                            'width': width,
                            'height': height,
                            'x': left + width // 2,
                            'y': top + height // 2
                        })
                return found
            except Exception as e:
                print(f"OCR Sub-pass error: {e}")
                return []

        detected.extend(extract_from_img(gray))
        detected.extend(extract_from_img(thresh1))
        detected.extend(extract_from_img(thresh2))
        detected.extend(extract_from_img(thresh3))
        
        # Deduplicate
        final_detected = []
        seen_codes = set()
        seen_pos = set()
        for item in detected:
            pos_key = f"{item['left'] // 15}_{item['top'] // 15}"
            # Keep unique positions to show on overlay, and avoid exact duplicate codes in same spot
            if pos_key not in seen_pos:
                final_detected.append(item)
                seen_pos.add(pos_key)
                seen_codes.add(item['code'])
                    
        return jsonify({'success': True, 'codes': final_detected})
    except Exception as e:
        print(f"Detect codes error: {e}")
        return jsonify({'error': str(e)}), 500

# ==========================================
# SMART CODE EXTRACTION (PDF + OCR FALLBACK)
# ==========================================

def normalize_code(text):
    text = text.replace(" ", "")
    text = text.replace("–", "-").replace("—", "-")
    return text.strip()

def extract_code_regex(text):
    patterns = [
        r'[A-Z]{1,3}\d{2,5}-\d{1,3}',   # WK160-27
        r'[A-Z]{1,3}\d{2,5}',          # WK160
        r'\d{4,}'                      # 12345
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return normalize_code(match.group(0))
    return ""

def extract_code_ocr(image, target_point):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    
    thresh = cv2.threshold(
        gray, 0, 255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )[1]

    config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'

    # Use image_to_data for word-level coordinates
    d = pytesseract.image_to_data(thresh, config=config, output_type=pytesseract.Output.DICT)
    
    target_x, target_y = target_point
    best_code = ""
    min_dist = float('inf')
    
    for i in range(len(d['text'])):
        word_text = d['text'][i].strip()
        if not word_text or len(word_text) < 3: continue
        
        # Apply regex on EACH word separately
        code = extract_code_regex(word_text)
        if not code: continue
        
        # Calculate center of this word's bounding box
        left, top, w, h = d['left'][i], d['top'][i], d['width'][i], d['height'][i]
        cx, cy = left + w/2, top + h/2
        
        # Euclidean distance
        dist = ((cx - target_x)**2 + (cy - target_y)**2)**0.5
        
        if dist < min_dist:
            min_dist = dist
            best_code = code
            
    return best_code

def extract_code_from_pdf(page, target_center_pdf):
    """
    Robust PDF text extraction using a radial search.
    Searches all text blocks within the PDF vector layer near the selection.
    """
    # Use get_text("words") for precise word-level coordinates
    words = page.get_text("words")
    tx, ty = target_center_pdf
    
    candidates = []
    
    # 1. Collect all potential codes within a reasonable radius (300 points)
    for w in words:
        x0, y0, x1, y1, word_text = w[:5]
        
        # Clean the text (remove noise)
        clean_text = word_text.strip().upper()
        code = extract_code_regex(clean_text)
        
        if code:
            # Calculate center of the word
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            dist = ((cx - tx)**2 + (cy - ty)**2)**0.5
            
            # If it's within 400 points (about 5-6 inches on a standard page)
            if dist < 400:
                candidates.append({'code': code, 'dist': dist})
    
    # 2. Sort by distance and return the closest one
    if not candidates:
        return ""
        
    candidates.sort(key=lambda x: x['dist'])
    return candidates[0]['code']

def _build_cors_preflight_response():

    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add('Access-Control-Allow-Headers', "*")
    response.headers.add('Access-Control-Allow-Methods', "*")
    return response

# ==========================================
# IMAGE PROCESSING ENGINE
# ==========================================

# ==========================================
# PRODUCTION-GRADE MODULAR PIPELINE
# ==========================================

def detect_walls(image):
    """Step 1: Adaptive Scene Segmentation using SegFormer (ADE20K)"""
    try:
        h, w = image.shape[:2]
        
        # Memory Optimization: Resize for model inference if image is very large
        # SegFormer-b0 is optimized for 512x512
        max_dim = 1024
        scale = 1.0
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            image_small = cv2.resize(image, (int(w * scale), int(h * scale)))
        else:
            image_small = image

        inputs = scene_processor(images=image_small, return_tensors="pt").to(scene_model.device)
        with torch.no_grad():
            outputs = scene_model(**inputs)
        
        # REDUCED MEMORY PIPELINE:
        # Instead of upsampling the full 150-channel logits (which causes OOM on CPU),
        # we process the probability maps at model resolution and then upsample 1-channel results.
        logits = outputs.logits # [1, 150, H_m, W_m]
        
        # 1. Extract Wall probabilities (Class 0)
        probs_small = torch.nn.functional.softmax(logits, dim=1)[0]
        wall_prob_small = probs_small[0:1].unsqueeze(0) # [1, 1, H_m, W_m]
        
        # Upsample only the 1-channel wall map to original image size
        wall_conf = nn.functional.interpolate(wall_prob_small, size=(h, w), mode="bilinear", align_corners=False)[0, 0].cpu().numpy()
        
        # 2. Extract structural labels
        labels_small = logits.argmax(dim=1)[0].cpu().numpy()
        # Upsample labels using nearest neighbor to preserve category IDs
        labels = cv2.resize(labels_small.astype(np.float32), (w, h), interpolation=cv2.INTER_NEAREST).astype(np.int32)

        # Adaptive confidence threshold
        conf_thresh = np.percentile(wall_conf, 40) 
        wall_mask = (wall_conf > max(0.5, conf_thresh)).astype(np.uint8)
        
        # Structural protection: floor(3), ceiling(5), windowpane(8), mirror(18)
        # We use the upsampled labels mask
        protection_ids = [3, 4, 5, 8, 11, 14, 18, 28, 31, 32, 33, 34, 35, 36, 42, 43, 47, 51, 158]
        structural_protection = np.isin(labels, protection_ids).astype(np.uint8)
        
        return wall_mask, structural_protection, labels
    except Exception as e:
        print(f"Fallback in detect_walls: {e}")
        return np.ones(image.shape[:2], dtype=np.uint8), np.zeros(image.shape[:2], dtype=np.uint8), None

def detect_objects(image):
    """Step 2: Dynamic Object Protection Layer using YOLOv8"""
    try:
        h, w = image.shape[:2]
        object_mask = np.zeros((h, w), dtype=np.uint8)
        
        # Run YOLO with dynamic confidence filtering
        results = yolo_model.predict(image, conf=0.25, verbose=False)
        for res in results:
            if res.masks is not None:
                for m_data in res.masks.data:
                    m_resized = cv2.resize(m_data.cpu().numpy(), (w, h), interpolation=cv2.INTER_NEAREST)
                    object_mask[m_resized > 0] = 1
        return object_mask
    except Exception:
        return np.zeros(image.shape[:2], dtype=np.uint8)

def detect_edges(image):
    """Step 3: Adaptive Edge Detection using median-based statistics"""
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    v = np.median(gray)
    
    # Adaptive sigma for Canny based on global image statistics
    sigma = 0.33
    lower = int(max(0, (1.0 - sigma) * v))
    upper = int(min(255, (1.0 + sigma) * v))
    edges = cv2.Canny(gray, lower, upper)
    
    # Resolution-aware dilation kernel
    diag = np.sqrt(image.shape[0]**2 + image.shape[1]**2)
    k_size = max(3, int(diag / 400))
    if k_size % 2 == 0: k_size += 1
    
    kernel = np.ones((k_size, k_size), np.uint8)
    return cv2.dilate(edges, kernel, iterations=1)

def detect_texture(image):
    """Step 4: Dynamic Texture/Graphic Removal (Stickers, Posters, Frames)"""
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    
    # Calculate local variation using gradient magnitude
    grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = cv2.sqrt(grad_x**2 + grad_y**2)
    
    # Dynamic window size for local variance
    win_size = max(9, int(min(image.shape[:2]) / 80))
    if win_size % 2 == 0: win_size += 1
    
    # Blur the magnitude to get local texture density
    texture_density = cv2.GaussianBlur(grad_mag, (win_size, win_size), 0)
    
    # Adaptive threshold: Only remove regions with variance significantly higher 
    # than the image's median texture
    t_thresh = np.percentile(texture_density, 88)
    return (texture_density > t_thresh).astype(np.uint8)

def detect_glass(image):
    """Step 5: Dynamic Glass/Window Detection (HSV Percentiles)"""
    hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
    s_channel = hsv[:,:,1]
    v_channel = hsv[:,:,2]
    
    # Glass rule: High brightness + Low saturation relative to the room stats
    v_thresh = np.percentile(v_channel, 93) 
    s_thresh = np.percentile(s_channel, 12) 
    
    return ((v_channel > v_thresh) & (s_channel < s_thresh)).astype(np.uint8)

def refine_mask(image, wall_mask, protection_mask):
    """Step 6: Fine Segmentation & Boundary Refinement using SAM"""
    try:
        sam_predictor.set_image(image)
        wall_y, wall_x = np.where(wall_mask > 0)
        if len(wall_x) == 0: return wall_mask
        
        # Adaptive point count based on wall area
        point_count = min(15, max(5, int(len(wall_x) / 50000)))
        sample_indices = np.linspace(0, len(wall_x) - 1, point_count).astype(int)
        points = np.column_stack((wall_x[sample_indices], wall_y[sample_indices]))
        
        final_masks = []
        for pt in points:
            masks, scores, _ = sam_predictor.predict(
                point_coords=np.array([pt]), point_labels=np.array([1]), multimask_output=True
            )
            m = masks[np.argmax(scores)]
            
            # Confidence check: Ignore masks that bleed into protected objects
            overlap = np.sum(np.logical_and(m, protection_mask)) / (np.sum(m) + 1)
            if overlap < 0.15:
                final_masks.append(m)
        
        return np.logical_or.reduce(final_masks).astype(np.uint8) if final_masks else wall_mask
    except Exception:
        return wall_mask

def finalize_mask(mask, image_shape):
    """Step 8 & 9: Dynamic Morphology & Edge Smoothing"""
    mask = mask.astype(np.uint8)
    h, w = image_shape[:2]
    diag = np.sqrt(h**2 + w**2)
    
    # Adaptive kernel for closing small gaps
    k_size = max(3, int(diag / 300))
    if k_size % 2 == 0: k_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
    
    # Step 8: Morphological Cleanup
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    
    # Connected component filtering to remove small noise
    num_labels, labels_cc, stats, _ = cv2.connectedComponentsWithStats(mask)
    if num_labels > 1:
        max_area = np.max(stats[1:, cv2.CC_STAT_AREA])
        mask = np.isin(labels_cc, [i for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > max_area * 0.04]).astype(np.uint8)
    
    # Step 9: Sharp but smooth blending (Small Resolution-aware Gaussian)
    blur_size = max(3, int(diag / 600))
    if blur_size % 2 == 0: blur_size += 1
    alpha = cv2.GaussianBlur(mask.astype(np.float32), (blur_size, blur_size), 0)
    
    # 🔥 Boost mask strength to prevent "patchy" walls
    alpha = np.clip(alpha * 1.2, 0, 1)
    
    return alpha

def tile_texture(texture, target_h, target_w, scale=1.0):
    """
    Dynamic High-Fidelity Tiling.
    Automatically balances pattern density so the texture looks "natural" 
    on walls of different resolutions.
    """
    try:
        th, tw = texture.shape[:2]
        
        # 🚀 DYNAMIC SCALING: Ensure the pattern isn't "too dense"
        # If the user hasn't provided a custom scale, we calculate a "Natural Scale"
        # based on the room height.
        if scale == 1.0:
            # We want one tile to cover roughly 20% of the room height for a natural look
            ideal_height = target_h * 0.20
            natural_scale = ideal_height / th
            
            # Limit the auto-upscale to prevent excessive blurriness (max 2.5x)
            scale = max(1.0, min(natural_scale, 2.5))
            
        # Step 1: Apply the calculated or user-provided scale
        if scale != 1.0:
            texture = cv2.resize(texture, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4)
            th, tw = texture.shape[:2]
            
        # Step 2: Repeat pattern to fill the image
        repeat_y = (target_h // th) + 1
        repeat_x = (target_w // tw) + 1
        
        tiled = np.tile(texture, (repeat_y, repeat_x, 1))
        
        # Step 3: Final Crop
        return tiled[:target_h, :target_w]
    except Exception as e:
        print(f"Error in dynamic tiling: {e}")
        return cv2.resize(texture, (target_w, target_h))

def remove_wall_glare(image, mask):
    """
    Step 9: Dynamic Highlight Suppression.
    Detects and removes extreme sunlight or LED glare from the wall.
    """
    try:
        # Convert to LAB for luminance manipulation
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        
        # Only analyze the wall area
        wall_mask = (mask > 0.5).astype(np.uint8)
        if np.sum(wall_mask) == 0: return image
        
        wall_l = l[wall_mask > 0]
        
        # Detect glare: Top 5% of brightness in the wall
        glare_thresh = max(230, np.percentile(wall_l, 95))
        glare_mask = (l > glare_thresh) & (wall_mask > 0)
        
        if np.any(glare_mask):
            # Dilate to cover the glow around the glare
            kernel = np.ones((15, 15), np.uint8)
            glare_mask_uint8 = glare_mask.astype(np.uint8) * 255
            glare_mask_dilated = cv2.dilate(glare_mask_uint8, kernel, iterations=2)
            
            # Use Telea Inpainting to fill glare with surrounding wall texture/color
            l_cleaned = cv2.inpaint(l, glare_mask_dilated, 10, cv2.INPAINT_TELEA)
            
            # Smooth transition
            l_final = cv2.addWeighted(l, 0.3, l_cleaned, 0.7, 0)
            
            lab_new = cv2.merge([l_final, a, b])
            return cv2.cvtColor(lab_new, cv2.COLOR_LAB2RGB)
        return image
    except Exception as e:
        print(f"Glare Removal Error: {e}")
        return image

def apply_artistic_filter(image):
    """
    Architectural Tone Mapping & Premium Visual Filter.
    Enhances the final render for a professional, high-end look.
    """
    try:
        # 1. Local Contrast Enhancement (CLAHE)
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8,8))
        l = clahe.apply(l)
        img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2RGB)
        
        # 2. Color Balance (Subtle warming for premium feel)
        img = img.astype(np.float32)
        img[:,:,0] *= 1.02 # Red
        img[:,:,2] *= 0.98 # Blue
        
        # 3. Vibrance (Selective saturation)
        hsv = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:,:,1] *= 1.05
        img = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
        
        # 4. Professional Vignette
        h, w = img.shape[:2]
        kernel_x = cv2.getGaussianKernel(w, int(w/1.2))
        kernel_y = cv2.getGaussianKernel(h, int(h/1.2))
        v_mask = (kernel_y * kernel_x.T)
        v_mask = v_mask / v_mask.max()
        v_mask = np.power(v_mask, 0.08) # Extremely subtle
        
        img_f = img.astype(np.float32)
        for i in range(3):
            img_f[:,:,i] *= v_mask
            
        return np.clip(img_f, 0, 255).astype(np.uint8)
    except Exception:
        return image

def apply_texture(image, mask, texture, scale=1.0):
    """
    MEMORY-OPTIMIZED TEXTURE RENDERING PIPELINE
    """
    try:
        h, w = image.shape[:2]
        
        # --- 1. GLARE REGION ISOLATION ---
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.float32)
        l_channel = lab[:,:,0]
        
        wall_mask = (mask > 0.5).astype(np.float32)
        wall_l = l_channel[mask > 0.5]
        if len(wall_l) == 0: 
            return image
        
        idz_thresh = max(210, np.percentile(wall_l, 82))
        idz_mask = ((l_channel > idz_thresh) * wall_mask).astype(np.uint8)
        
        # Cleanup early
        del l_channel
        
        kernel_size = max(19, int(min(h, w) / 50))
        kernel = np.ones((kernel_size, kernel_size), np.uint8)
        idz_mask_expanded = cv2.dilate(idz_mask, kernel, iterations=2)
        
        # --- 2. FULL RGB RECONSTRUCTION ---
        reconstructed_rgb = cv2.inpaint(image, idz_mask_expanded, 20, cv2.INPAINT_TELEA).astype(np.float32)
        
        # --- 3. CLEAN LIGHTING ESTIMATION ---
        # Reuse lab variable to save memory
        cv2.cvtColor(reconstructed_rgb.astype(np.uint8), cv2.COLOR_RGB2LAB, dst=lab)
        l_recon = lab[:,:,0]
        l_recon_smooth = cv2.bilateralFilter(l_recon.astype(np.uint8), 11, 85, 85).astype(np.float32)
        
        valid_wall_mask = (mask > 0.5) & (idz_mask_expanded == 0)
        mean_l_clean = np.mean(l_recon_smooth[valid_wall_mask]) if np.any(valid_wall_mask) else np.mean(l_recon_smooth[mask > 0.5])
        
        lighting_map = l_recon_smooth / (mean_l_clean + 1e-6)
        np.clip(lighting_map, 0.6, 1.25, out=lighting_map)
        
        # --- 4. TEXTURE APPLICATION ---
        tiled_tex = tile_texture(texture, h, w, scale=scale).astype(np.float32)
        
        # Multiply in-place
        blended = tiled_tex * np.expand_dims(lighting_map, axis=2)
        
        # Detail restoration
        l_detail = l_recon - cv2.GaussianBlur(l_recon, (9, 9), 0)
        blended += np.expand_dims(l_detail * 0.1, axis=2)
        np.clip(blended, 0, 255, out=blended)
        
        # Cleanup
        del l_recon, l_recon_smooth, lighting_map, tiled_tex, l_detail
        
        # --- 5. CLEAN SURFACE BLENDING ---
        feather_size = max(3, int(np.sqrt(h**2 + w**2) / 550))
        if feather_size % 2 == 0: feather_size += 1
        alpha_mask = cv2.GaussianBlur(mask, (feather_size, feather_size), 0)
        alpha_mask_3d = np.expand_dims(alpha_mask, axis=2)
        
        # Result calculation with optimized memory
        result = (blended * alpha_mask_3d)
        result += (reconstructed_rgb * (1.0 - alpha_mask_3d))
        
        # Final cleanup before artistic filter
        del blended, alpha_mask_3d, reconstructed_rgb
        
        return apply_artistic_filter(np.clip(result, 0, 255).astype(np.uint8))
        
    except Exception as e:
        print(f"Memory-Optimized Rendering Error: {e}")
        import traceback
        traceback.print_exc()
        return image





def remove_black_strips(texture):
    """
    Detect and remove dark horizontal bands (black strips) often found in PDF catalogs.
    Uses HSV thresholding and inpainting.
    """
    try:
        hsv = cv2.cvtColor(texture, cv2.COLOR_RGB2HSV)
        # Detect dark horizontal bands
        mask = cv2.inRange(hsv, (0, 0, 0), (180, 255, 80))
        
        kernel = np.ones((7, 25), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=2)
        
        cleaned = cv2.inpaint(texture, mask, 5, cv2.INPAINT_TELEA)
        return cleaned
    except Exception as e:
        print(f"Error in black strip removal: {e}")
        return texture

def remove_text_from_texture(texture):
    """
    Remove text from texture completely using OpenCV Inpainting.
    Detects both dark and light text regions and fills them with surrounding patterns.
    """
    try:
        gray = cv2.cvtColor(texture, cv2.COLOR_RGB2GRAY)

        # Detect dark text regions
        _, thresh1 = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY_INV)
        # Detect light text regions
        _, thresh2 = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

        # Combine masks
        text_mask = cv2.bitwise_or(thresh1, thresh2)

        # Morphological operations to highlight text-like areas and close gaps
        kernel = np.ones((5,5), np.uint8)
        text_mask = cv2.dilate(text_mask, kernel, iterations=2)

        # Inpaint to remove text
        cleaned = cv2.inpaint(texture, text_mask, 3, cv2.INPAINT_TELEA)

        return cleaned
    except Exception as e:
        print(f"Error in text removal: {e}")
        return texture

@app.route('/api/process-wall', methods=['POST'])
def process_wall():
    try:
        if 'wall_image' not in request.files: return jsonify({'error': 'Missing wall_image'}), 400
        wall_file = request.files['wall_image']
        wall_bytes = wall_file.read()
        image_hash = hashlib.md5(wall_bytes).hexdigest()
        
        # Optimized Cache Retrieval
        if image_hash == wall_cache.get('hash') and wall_cache.get('image') is not None:
            image = wall_cache['image']
            mask_soft = wall_cache['mask_soft']
            l_wall_smooth = wall_cache['l_wall_smooth']
            wall_mean_l = wall_cache['wall_mean_l']
        else:
            # Clear cache to free memory before processing new image
            wall_cache.clear()
            # Step 0: Pre-process

            nparr = np.frombuffer(wall_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if image is None: return jsonify({'error': 'Failed to decode image.'}), 400
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            h, w = image.shape[:2]

            # --- REDESIGNED PRODUCTION PIPELINE ---
            
            # 1. Base Wall Mask (SegFormer)
            wall_mask, structural_protection, labels = detect_walls(image)
            
            # 2. Object Protection (YOLO)
            object_mask = detect_objects(image)
            protection_layer = np.logical_or(structural_protection > 0, object_mask > 0).astype(np.uint8)
            
            # 6. SAM Refinement (Early for high-quality boundaries)
            refined = refine_mask(image, wall_mask, protection_layer)
            
            # 3. STABLE EDGE SMOOTHING (NOT removal)
            # Instead of setting to 0, we just soften the edges to prevent "harsh" transitions
            edge_mask = detect_edges(image)
            refined = refined.astype(np.float32)
            refined[edge_mask > 0] *= 0.7
            
            # 5. Dynamic Glass Detection (Keep for safety)
            glass_mask = detect_glass(image)
            refined[glass_mask > 0] = 0
            
            # 7 & 8 & 9: Final Logic & Cleanup
            refined[protection_layer > 0] = 0 # Final strict object protection
            mask_soft = finalize_mask(refined, image.shape)
            
            # 📸 DEBUG: Save mask visually to catch "holes"
            cv2.imwrite(os.path.join(app.config['UPLOAD_FOLDER'], "debug_mask.png"), (mask_soft * 255).astype(np.uint8))
            
            # lighting Extraction
            lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.float32)
            l_wall_smooth = cv2.bilateralFilter(np.clip(lab[:,:,0], 0, 255).astype(np.uint8), 9, 75, 75).astype(np.float32)
            wall_mean_l = np.mean(l_wall_smooth[mask_soft > 0.5]) if np.any(mask_soft > 0.5) else 128.0
            
            wall_cache.update({'hash': image_hash, 'image': image, 'mask_soft': mask_soft, 'l_wall_smooth': l_wall_smooth, 'wall_mean_l': wall_mean_l})

        # Texture retrieval
        texture = None
        if 'texture_image' in request.files:
            tex_file = request.files['texture_image']
            tex_bytes = tex_file.read()
            nparr_tex = np.frombuffer(tex_bytes, np.uint8)
            texture = cv2.imdecode(nparr_tex, cv2.IMREAD_COLOR)
        else:
            texture_url = request.form.get('texture_url')
            if not texture_url:
                return jsonify({'error': 'Missing texture_url'}), 400
            
            tex_filename = texture_url.split('/')[-1]
            # Check if it's a filter or a regular upload
            if '/filters/' in texture_url:
                tex_path = os.path.join(app.config['UPLOAD_FOLDER'], 'filters', tex_filename)
            else:
                tex_path = os.path.join(app.config['UPLOAD_FOLDER'], tex_filename)
                
            texture = cv2.imread(tex_path)

        if texture is None: return jsonify({'error': 'Texture not found'}), 400
        texture = cv2.cvtColor(texture, cv2.COLOR_BGR2RGB)
        
        # Step 10: Apply Texture (Using RAW extracted data)
        result = apply_texture(image, mask_soft, texture)
        
        res_filename = f"result_{int(time.time())}.jpg"
        cv2.imwrite(os.path.join(app.config['UPLOAD_FOLDER'], res_filename), cv2.cvtColor(result, cv2.COLOR_RGB2BGR))
        
        return jsonify({'resultUrl': f"http://localhost:5000/uploads/{res_filename}"})
    except Exception as e:
        print(f"Server Error: {e}")
        return jsonify({'error': f"Internal Error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({'error': f"Internal Error: {str(e)}"}), 500

@app.route('/api/get-code-from-pdf', methods=['POST'])
def get_code_from_pdf():
    data = request.json
    page_url = data.get('page_url')
    x = data.get('x')
    y = data.get('y')
    width = data.get('width')
    height = data.get('height')
    scale_x = data.get('scale_x', 1.0)
    scale_y = data.get('scale_y', 1.0)

    print(f"DEBUG: get_code_from_pdf received: {data}", flush=True)
    
    if page_url is None or x is None or y is None or width is None or height is None:
        return jsonify({'error': 'Missing data', 'received': data}), 400

    # Extract page index
    try:
        img_name = page_url.split('/')[-1]
        page_index = int(img_name.split('_')[1].split('.')[0])
    except Exception as e:
        return jsonify({'error': f'Invalid page_url: {str(e)}'}), 400

    pdf_name = data.get('pdf_path', 'temp.pdf')
    pdf_path = os.path.join(app.config['UPLOAD_FOLDER'], pdf_name)

    print(f"DEBUG: PDF path: {pdf_path}", flush=True)
    print(f"DEBUG: Exists: {os.path.exists(pdf_path)}", flush=True)

    if not os.path.exists(pdf_path):
        return jsonify({'error': 'PDF not found', 'path': pdf_path}), 400

    try:
        doc = fitz.open(pdf_path)
        page = doc.load_page(page_index)
        
        # Map crop center to PDF coordinates
        pdf_rect = page.rect
        # We need the original image dimensions to scale correctly
        # Usually they are same as the ones used in get_code
        # But we can try to infer from the page URL if needed, 
        # or just assume the same scaling logic
        
        # Fetch image to get dimensions for scaling
        img_name = page_url.split('/')[-1]
        img_path = os.path.join(app.config['UPLOAD_FOLDER'], 'pages', img_name)
        image = cv2.imread(img_path)
        if image is None: return jsonify({'error': 'Image not found'}), 404
        
        img_h, img_w = image.shape[:2]
        scale_pdf_x = pdf_rect.width / img_w
        scale_pdf_y = pdf_rect.height / img_h
        
        # Target center in image pixels
        # frontend sends completedCrop.x, y, width, height which are relative to the CSS display size
        # scale_x/y converts them to natural image pixels
        real_center_x = (x + width/2) * scale_x
        real_center_y = (y + height/2) * scale_y
        
        center_pdf = (real_center_x * scale_pdf_x, real_center_y * scale_pdf_y)
        
        code = extract_code_from_pdf(page, center_pdf)
        doc.close()
        
        if not code:
            # ==========================================
            # STEP 2: OCR FALLBACK (Search BELOW selection)
            # ==========================================
            try:
                # Map coordinates to image pixels
                real_x = int(x * scale_x)
                real_y = int(y * scale_y)
                real_w = int(width * scale_x)
                real_h = int(height * scale_y)
                
                # Expand search area BELOW the selection (where codes usually are)
                search_y1 = real_y
                search_y2 = min(real_y + real_h + 300, img_h) # Search 300px below
                search_x1 = max(0, real_x - 100)
                search_x2 = min(real_x + real_w + 100, img_w)
                
                # Create a non-destructive COPY for OCR
                roi = image[search_y1:search_y2, search_x1:search_x2].copy()
                
                # Pre-process COPY for better Tesseract detection
                gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
                # Apply thresholding to make text pop
                gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
                
                ocr_text = pytesseract.image_to_string(gray)
                codes = re.findall(r'[A-Z]{2,}\d{3,}-\d{2,}', ocr_text)
                
                if codes:
                    code = codes[0]
            except Exception as ocr_err:
                print(f"OCR Fallback Error: {ocr_err}")

        if not code:
            return jsonify({'success': False, 'message': 'No code found near selection'})

        return jsonify({
            'success': True,
            'code': code
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
# ==========================================
# AUTHENTICATION ROUTES
# ==========================================
@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name')
    mobile = data.get('mobile')
    email = data.get('email')
    password = data.get('password')

    if not all([name, mobile, email, password]):
        return jsonify({'success': False, 'message': 'All fields are required'}), 400

    hashed_pw = generate_password_hash(password)

    try:
        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('INSERT INTO users (name, mobile, email, password) VALUES (?, ?, ?, ?)',
                  (name, mobile, email, hashed_pw))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Registration successful'})
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'Mobile number or Email already exists'}), 409
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    # Handle both 'identifier' (Admin) and 'email' (Legacy User) keys
    identifier = data.get('identifier') or data.get('email')
    password = data.get('password')

    if not identifier or not password:
        return jsonify({'success': False, 'message': 'Missing credentials'}), 400

    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    # Search by email or mobile to support all login types
    c.execute('SELECT * FROM users WHERE email = ? OR mobile = ?', (identifier, identifier))
    user = c.fetchone()
    conn.close()

    if user and check_password_hash(user[4], password):
        return jsonify({
            'success': True,
            'user': {
                'id': user[0],
                'name': user[1],
                'email': user[3]
            }
        })
    
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

if __name__ == '__main__':
    load_models()
    from waitress import serve
    print("→ Starting Production Server on http://localhost:5000", flush=True)
    serve(app, host='0.0.0.0', port=5000, threads=2)
