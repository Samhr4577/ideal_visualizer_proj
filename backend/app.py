from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import time
import cv2
import numpy as np
import torch
from segment_anything import sam_model_registry, SamPredictor
from PIL import Image
import io
import fitz

app = Flask(__name__)
CORS(app)

import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash

DATABASE = 'users.db'

def init_db():
    with sqlite3.connect(DATABASE) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        ''')

with app.app_context():
    init_db()

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({'error': 'Missing required fields'}), 400

    hashed_password = generate_password_hash(password)

    try:
        with sqlite3.connect(DATABASE) as conn:
            conn.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', (name, email, hashed_password))
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Email already exists'}), 409

    return jsonify({'success': True, 'message': 'User created successfully'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Missing email or password'}), 400

    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.execute('SELECT name, password FROM users WHERE email = ?', (email,))
        row = cursor.fetchone()

    if row and check_password_hash(row[1], password):
        return jsonify({'success': True, 'message': 'Login successful', 'name': row[0]})
    else:
        return jsonify({'error': 'Invalid email or password'}), 401

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Mock Data
rooms = [
    {
        'id': 'living-room',
        'name': 'Living Room',
        'image': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&h=400&fit=crop',
        'description': 'Explore wall and floor options for your living space',
    },
    {
        'id': 'bedroom',
        'name': 'Bedroom',
        'image': 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=600&h=400&fit=crop',
        'description': 'Design your perfect bedroom retreat',
    },
    {
        'id': 'kitchen',
        'name': 'Kitchen',
        'image': 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop',
        'description': 'Visualize countertops, backsplash and flooring',
    },
    {
        'id': 'bathroom',
        'name': 'Bathroom',
        'image': 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=600&h=400&fit=crop',
        'description': 'Preview tiles, walls and flooring for your bathroom',
    },
    {
        'id': 'dining-room',
        'name': 'Dining Room',
        'image': 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=600&h=400&fit=crop',
        'description': 'Find the ideal look for your dining area',
    },
    {
        'id': 'hallway',
        'name': 'Hallway / Entryway',
        'image': 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&h=400&fit=crop',
        'description': 'Make a great first impression with the right finishes',
    },
    {
        'id': 'office',
        'name': 'Home Office',
        'image': 'https://images.unsplash.com/photo-1593062096033-9a26b09da705?w=600&h=400&fit=crop',
        'description': 'Create a productive and inspiring workspace',
    },
    {
        'id': 'laundry',
        'name': 'Laundry Room',
        'image': 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=600&h=400&fit=crop',
        'description': 'Durable and stylish options for utility spaces',
    },
]

products = [
    # Marbles
    {'id': 1, 'name': 'Calacatta Gold Marble', 'type': 'wall', 'color': '#f8f8f8', 'preview': 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1000&q=80'},
    {'id': 2, 'name': 'Black Marquina Marble', 'type': 'wall', 'color': '#1a1a1a', 'preview': 'https://images.unsplash.com/photo-1504198453319-5ce911bafcde?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1504198453319-5ce911bafcde?w=1000&q=80'},
    {'id': 3, 'name': 'Emerald Green Marble', 'type': 'wall', 'color': '#1b4d3e', 'preview': 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=1000&q=80'},
    
    # Colorful Wallpapers
    {'id': 4, 'name': 'Tropical Floral Design', 'type': 'wall', 'color': '#ffcc00', 'preview': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1000&q=80'},
    {'id': 5, 'name': 'Abstract Geometric Color', 'type': 'wall', 'color': '#3498db', 'preview': 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1000&q=80'},
    {'id': 6, 'name': 'Vintage Royal Gold', 'type': 'wall', 'color': '#d4af37', 'preview': 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?w=1000&q=80'},
    {'id': 7, 'name': 'Modern Art Blue', 'type': 'wall', 'color': '#2980b9', 'preview': 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1000&q=80'},
    
    # Flooring
    {'id': 8, 'name': 'Polished Oak Floor', 'type': 'floor', 'color': '#b8956a', 'preview': 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1000&q=80'},
    {'id': 9, 'name': 'White Ceramic Tile', 'type': 'floor', 'color': '#ffffff', 'preview': 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1000&q=80'},
    {'id': 10, 'name': 'Slate Gray Stone', 'type': 'floor', 'color': '#2c3e50', 'preview': 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=200&h=200&fit=crop', 'pattern': 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1000&q=80'},
]

@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    return jsonify(rooms)

@app.route('/api/products', methods=['GET'])
def get_products():
    return jsonify(products)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        filename = f"{int(time.time())}_{file.filename}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        image_url = f"http://localhost:5000/uploads/{filename}"
        return jsonify({'imageUrl': image_url})

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

extracted_textures = []

@app.route('/api/admin/upload-pdf', methods=['POST'])
def upload_pdf():
    if 'pdf_file' not in request.files:
        return jsonify({'error': 'No PDF file provided'}), 400
    
    pdf_file = request.files['pdf_file']
    if pdf_file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    pdf_bytes = pdf_file.read()
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        return jsonify({'error': f'Failed to parse PDF: {str(e)}'}), 400

    images_extracted = []
    
    for page_index in range(len(doc)):
        page = doc[page_index]
        image_list = page.get_images(full=True)
        
        for img_index, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            if not base_image:
                continue
                
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            
            w = base_image.get("width", 0)
            h = base_image.get("height", 0)
            
            print(f"Extracted image {xref} on page {page_index}: {w}x{h}, format: {image_ext}", flush=True)
            
            filename = f"temp_ext_{int(time.time())}_{page_index}_{xref}.{image_ext}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            with open(filepath, "wb") as f:
                f.write(image_bytes)
                
            image_url = f"http://localhost:5000/uploads/{filename}"
            images_extracted.append({
                'id': filename,
                'url': image_url
            })
            
    return jsonify({'success': True, 'extracted_images': images_extracted})

@app.route('/api/admin/save-textures', methods=['POST'])
def save_textures():
    data = request.json
    selected_images = data.get('selected_images', [])
    
    for img in selected_images:
        new_texture = {
            'id': img['id'],
            'url': img['url'],
            'name': f"Pattern {len(extracted_textures) + 1}"
        }
        # Prevent duplicates
        if not any(t['id'] == img['id'] for t in extracted_textures):
            extracted_textures.append(new_texture)
        
    return jsonify({'success': True, 'total_textures': len(extracted_textures)})

@app.route('/api/extracted-textures', methods=['GET'])
def get_extracted_textures():
    return jsonify(extracted_textures)

import hashlib

wall_cache = {
    'hash': None,
    'image': None,
    'mask_soft': None,
    'l_wall_smooth': None,
    'wall_mean_l': None
}

predictor = None

@app.route('/api/process-wall', methods=['POST'])
def process_wall():
    global predictor
    global wall_cache
    
    if 'wall_image' not in request.files:
        return jsonify({'error': 'Missing wall_image'}), 400

    wall_file = request.files['wall_image']
    wall_bytes = wall_file.read()
    image_hash = hashlib.md5(wall_bytes).hexdigest()

    if image_hash == wall_cache['hash']:
        print("Using cached wall image and mask!", flush=True)
        image = wall_cache['image']
        mask_soft = wall_cache['mask_soft']
        l_wall_smooth = wall_cache['l_wall_smooth']
        wall_mean_l = wall_cache['wall_mean_l']
    else:
        print("Processing new wall image...", flush=True)
        nparr = np.frombuffer(wall_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return jsonify({'error': 'Failed to decode wall_image. Please check format.'}), 400
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        if predictor is None:
            model_path = "sam_vit_b_01ec64.pth"
            if not os.path.exists(model_path):
                print(f"Downloading SAM model to {model_path}... This may take a few minutes depending on your internet connection.")
                import urllib.request
                url = "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth"
                urllib.request.urlretrieve(url, model_path)
                print("Download complete!")

            try:
                sam = sam_model_registry["vit_b"](checkpoint=model_path)
                sam.to("cuda" if torch.cuda.is_available() else "cpu")
                predictor = SamPredictor(sam)
            except Exception as e:
                return jsonify({'error': f'Failed to load model: {str(e)}'}), 500

        predictor.set_image(image)

        # Dynamic click point support
        try:
            click_x = int(request.form.get('click_x', 100))
            click_y = int(request.form.get('click_y', 300))
        except ValueError:
            click_x, click_y = 100, 300
            
        # Balanced Multi-Region Wall Detection
        h, w = image.shape[:2]
        
        # Check user click plus key wall areas to capture full room
        test_points = [
            [click_x, click_y],
            [int(w * 0.20), int(h * 0.50)], # Left wall
            [int(w * 0.80), int(h * 0.50)], # Right wall
            [int(w * 0.50), int(h * 0.35)], # Center wall
        ]

        wall_masks = []
        for pt in test_points:
            if not (0 <= pt[0] < w and 0 <= pt[1] < h):
                continue
                
            masks, scores, _ = predictor.predict(
                point_coords=np.array([pt]),
                point_labels=np.array([1]),
                multimask_output=True
            )
            
            for m in masks:
                area_ratio = np.sum(m) / (h * w)
                
                # Medium to large sizes (ignore tiny objects, ignore full-room masks)
                if area_ratio < 0.05 or area_ratio > 0.85:
                    continue
                    
                bottom_edge_touch = np.sum(m[int(h*0.85):, :]) / (w * int(h*0.15))
                top_edge_touch = np.sum(m[0:int(h*0.15), :]) / (w * int(h*0.15))
                
                # Balanced Rules: A wall can touch the floor/ceiling, but cannot DOMINATE it
                # 65% of bottom area = floor. 75% of top area = ceiling.
                if bottom_edge_touch > 0.65:
                    continue
                if top_edge_touch > 0.75:
                    continue
                    
                wall_masks.append(m)

        if len(wall_masks) > 0:
            # Union all valid wall regions to cover 90%+ of the walls
            mask = np.logical_or.reduce(wall_masks).astype(np.float32)
        else:
            # Fallback to user click
            masks, scores, _ = predictor.predict(
                point_coords=np.array([[click_x, click_y]]),
                point_labels=np.array([1]),
                multimask_output=True
            )
            mask = masks[np.argmax(scores)].astype(np.float32)

        # 6. Mask Cleanup: Merge nearby valid regions
        kernel_close = np.ones((15, 15), np.uint8) # Aggressive bridge for full wall coverage
        kernel_open = np.ones((5, 5), np.uint8)
        
        mask_clean = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, kernel_close)
        mask_clean = cv2.morphologyEx(mask_clean, cv2.MORPH_OPEN, kernel_open)

        # Connected components: Keep anything > 2% of the main wall to catch all wall parts
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_clean)
        if num_labels > 1:
            max_area = np.max(stats[1:, cv2.CC_STAT_AREA])
            valid_components = [i for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > max_area * 0.02]
            mask_clean = np.isin(labels, valid_components).astype(np.float32)
        else:
            mask_clean = mask_clean.astype(np.float32)
            
        # ==========================================
        # OBJECT DETECTION & EXCLUSION LAYER
        # ==========================================
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # 1. Window & Glass Detection (High Brightness / Overexposure)
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        v_channel = hsv[:,:,2]
        window_mask = (v_channel > 240).astype(np.uint8)
        window_mask = cv2.dilate(window_mask, np.ones((7,7), np.uint8))
        
        # 2. Furniture & Small Object Edge Detection (Switches, frames, shelves, decor)
        # Bilateral filter removes wall wallpaper/texture but preserves sharp object boundaries
        smooth_gray = cv2.bilateralFilter(gray, 9, 75, 75)
        edges = cv2.Canny(smooth_gray, 30, 100)
        # Tight 3x3 dilation acts as a razor-sharp protective boundary around all objects
        edge_mask = cv2.dilate(edges, np.ones((3,3), np.uint8))
        
        # Combine all detected objects into a single exclusion mask
        exclusion_mask = np.logical_or(window_mask > 0, edge_mask > 0)
        
        # Punch holes in the wall mask wherever an object exists
        mask_clean[exclusion_mask] = 0
        # ==========================================

        # 7. Realistic Application
        mask_soft = cv2.GaussianBlur(mask_clean, (11, 11), 0)
        
        # Enforce strict object boundaries post-blur to absolutely prevent texture bleeding onto furniture
        mask_soft[exclusion_mask] = 0
        mask_soft = np.clip(mask_soft, 0, 1)

        # Precompute lighting
        lab_image = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.float32)
        l_wall, _, _ = cv2.split(lab_image)
        l_wall_uint8 = np.clip(l_wall, 0, 255).astype(np.uint8)
        l_wall_smooth = cv2.bilateralFilter(l_wall_uint8, 9, 75, 75).astype(np.float32)
        wall_mean_l = np.mean(l_wall_smooth[mask_soft > 0.5]) if np.any(mask_soft > 0.5) else 128.0

        # Update cache
        wall_cache['hash'] = image_hash
        wall_cache['image'] = image
        wall_cache['mask_soft'] = mask_soft
        wall_cache['l_wall_smooth'] = l_wall_smooth
        wall_cache['wall_mean_l'] = wall_mean_l

    # --- PROCESS TEXTURE ---
    texture_url = request.form.get('texture_url')
    if texture_url:
        filename = texture_url.split('/')[-1]
        texture_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        texture = cv2.imread(texture_path)
        if texture is None:
            return jsonify({'error': 'Failed to load selected texture.'}), 400
        texture = cv2.cvtColor(texture, cv2.COLOR_BGR2RGB)
    elif 'texture_image' in request.files:
        texture_file = request.files['texture_image']
        texture_path = os.path.join(app.config['UPLOAD_FOLDER'], f"texture_{int(time.time())}_{texture_file.filename}")
        texture_file.save(texture_path)
        texture = cv2.imread(texture_path)
        if texture is None:
            return jsonify({'error': 'cv2.imread failed on texture_image. Please check format.'}), 400
        texture = cv2.cvtColor(texture, cv2.COLOR_BGR2RGB)
    else:
        return jsonify({'error': 'Missing texture_image or texture_url'}), 400

    def tile_texture(texture, shape):
        h, w = shape[:2]
        tex_h, tex_w = texture.shape[:2]
        tiled = np.tile(texture, (h//tex_h+2, w//tex_w+2, 1))
        return tiled[:h, :w]

    target_pattern_size = 250
    tex_h, tex_w = texture.shape[:2]
    scale = target_pattern_size / max(tex_h, tex_w)
    new_w, new_h = max(1, int(tex_w * scale)), max(1, int(tex_h * scale))
    texture_resized = cv2.resize(texture, (new_w, new_h))

    tiled_texture = tile_texture(texture_resized, image.shape)
    
    lab_texture = cv2.cvtColor(tiled_texture, cv2.COLOR_RGB2LAB).astype(np.float32)
    l_tex, a_tex, b_tex = cv2.split(lab_texture)
    
    lighting_diff = (l_wall_smooth - wall_mean_l) * 0.9
    l_result = np.clip(l_tex + lighting_diff, 0, 255)
    
    lab_result = cv2.merge((l_result, a_tex, b_tex))
    texture_adj = cv2.cvtColor(lab_result.astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)
    
    mask_soft_3d = np.expand_dims(mask_soft, axis=2)
    result = texture_adj * mask_soft_3d + image.astype(np.float32) * (1 - mask_soft_3d)
    result = result.astype(np.uint8)
    
    result_bgr = cv2.cvtColor(result, cv2.COLOR_RGB2BGR)
    result_filename = f"result_{int(time.time())}.jpg"
    result_path = os.path.join(app.config['UPLOAD_FOLDER'], result_filename)
    cv2.imwrite(result_path, result_bgr)

    return jsonify({'resultUrl': f"http://localhost:5000/uploads/{result_filename}"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
