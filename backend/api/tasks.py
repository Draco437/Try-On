from celery import shared_task
from datetime import datetime
from bson import ObjectId
import os
import requests
import uuid
import shutil
import time
from gradio_client import Client, handle_file
from PIL import Image

from .db import tryon_jobs_col, body_uploads_col, clothing_col


# ── HELPER: Resize & Compress Image to Prevent Timeouts ───────
def compress_and_prep_image(input_path, max_dim=1024):
    """
    Downscales large user images to max_dim and saves as lightweight JPEG.
    Reduces upload time to HF Space from 10s+ to sub-second.
    """
    try:
        with Image.open(input_path) as img:
            img = img.convert("RGB")
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            
            # Save compressed temp file
            compressed_path = input_path.rsplit('.', 1)[0] + '_prep.jpg'
            img.save(compressed_path, "JPEG", quality=85)
            return compressed_path
    except Exception as e:
        print(f"⚠️ Image compression failed: {e}")
        return input_path


# ── HELPER: Download image to temp file ──────────────────────
def download_to_temp(url):
    import tempfile
    if not url:
        return None
    try:
        print(f"📥 Downloading: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
        tmp.write(response.content)
        tmp.close()
        print(f"✅ Saved to: {tmp.name}")
        return tmp.name
    except Exception as e:
        print(f"❌ Download failed: {e}")
        return None


# ── HELPER: Save result to media folder ──────────────────────
def save_result_to_media(source_path, view_name):
    if not source_path or not os.path.exists(source_path):
        print(f"❌ Source file not found: {source_path}")
        return None
    try:
        ext       = os.path.splitext(source_path)[1] or '.webp'
        media_dir = os.path.join(os.getcwd(), 'media', 'results')
        os.makedirs(media_dir, exist_ok=True)
        filename  = f"{uuid.uuid4()}_{view_name}{ext}"
        dest_path = os.path.join(media_dir, filename)
        shutil.copy2(source_path, dest_path)
        print(f"✅ Saved result: {dest_path}")
        return f"http://127.0.0.1:8000/media/results/{filename}"
    except Exception as e:
        print(f"❌ Save failed: {e}")
        return None


# ── HELPER: Upload to S3 ──────────────────────────────────────
def upload_to_s3(source_path, view_name):
    bucket     = os.getenv('AWS_STORAGE_BUCKET')
    access_key = os.getenv('AWS_ACCESS_KEY_ID')
    secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
    if not bucket or not access_key or not secret_key:
        return None
    try:
        import boto3
        ext = os.path.splitext(source_path)[1] or '.webp'
        key = f"results/{uuid.uuid4()}_{view_name}{ext}"
        s3  = boto3.client(
            's3',
            aws_access_key_id     = access_key,
            aws_secret_access_key = secret_key,
            region_name           = os.getenv('AWS_REGION', 'ap-south-1'),
        )
        with open(source_path, 'rb') as f:
            s3.put_object(Bucket=bucket, Key=key, Body=f.read(), ContentType='image/webp')
        return f"https://{bucket}.s3.amazonaws.com/{key}"
    except Exception as e:
        print(f"❌ S3 upload failed: {e}")
        return None


# ── HELPER: Crop white padding ────────────────────────────────
def crop_white_padding(source_path):
    try:
        import numpy as np

        img       = Image.open(source_path).convert('RGB')
        img_array = np.array(img)
        non_white = np.any(img_array < 245, axis=2)
        rows      = np.any(non_white, axis=1)
        cols      = np.any(non_white, axis=0)

        if not rows.any() or not cols.any():
            return source_path

        row_min, row_max = np.where(rows)[0][[0, -1]]
        col_min, col_max = np.where(cols)[0][[0, -1]]

        pad     = 20
        row_min = max(0, row_min - pad)
        row_max = min(img_array.shape[0], row_max + pad)
        col_min = max(0, col_min - pad)
        col_max = min(img_array.shape[1], col_max + pad)

        cropped = img.crop((col_min, row_min, col_max, row_max))
        cropped.save(source_path, 'WEBP', quality=95)
        print(f"✅ Cropped padding: rows {row_min}-{row_max}, cols {col_min}-{col_max}")
        return source_path
    except Exception as e:
        print(f"⚠️ Crop failed: {e}")
        return source_path


# ── HELPER: Garment type mapping ─────────────────────────────
def get_garment_type(category):
    upper = ['tshirt', 'shirt', 'jacket']
    lower = ['jeans', 'pants']
    dress = ['dress']
    if category in upper:   return 'upper_body'
    elif category in lower: return 'lower_body'
    elif category in dress: return 'dresses'
    else:                   return 'upper_body'


# ── HELPER: Connect to Leffa Space ───────────────────────────
def get_leffa_client(max_attempts=3):
    """Connects to the Leffa HF Space with extended timeout settings."""
    hf_token = os.getenv('HF_TOKEN')
    
    for attempt in range(1, max_attempts + 1):
        print(f"🔌 Connecting to Leffa HF Space (attempt {attempt}/{max_attempts})...")
        try:
            # Adding upload_files=True & setting explicit timeout if supported
            kwargs = {"max_workers": 1}
            if hf_token:
                try:
                    client = Client("franciszzj/Leffa", token=hf_token, **kwargs)
                except TypeError:
                    client = Client("franciszzj/Leffa", hf_token=hf_token, **kwargs)
                print("✅ Connected with HF Token")
            else:
                client = Client("franciszzj/Leffa", **kwargs)
                print("⚠️ Connected anonymously")

            return client

        except Exception as e:
            print(f"❌ Connection attempt {attempt} failed: {type(e).__name__}: {e}")
            if attempt < max_attempts:
                wait = 3 * attempt
                print(f"⏳ Waiting {wait}s before retry...")
                time.sleep(wait)
            else:
                raise


# ── HELPER: Process single view with Leffa ───────────────────
def process_one_view_with_leffa(client, person_url, garment_path, garment_type, view_name):
    print(f"\n--- Processing {view_name.upper()} view ---")

    if not person_url:
        print(f"⚠️ No URL provided for {view_name}")
        return None

    raw_person_path = download_to_temp(person_url)
    if not raw_person_path:
        print(f"⚠️ Download failed for {view_name} — using original")
        return person_url

    # Pre-process image to drastically cut down file size & prevent SSL timeout
    person_path = compress_and_prep_image(raw_person_path)

    try:
        print(f"🚀 Running try-on prediction ({garment_type})...")
        result = client.predict(
            handle_file(person_path),
            handle_file(garment_path),
            False,
            15,           # Lowered steps to reduce processing time on HF
            2.5,
            42,
            "viton_hd",
            garment_type,
            False,
            api_name="/leffa_predict_vt"
        )

        result_path = None
        if result and isinstance(result, (list, tuple)):
            result_path = result[0]
            if isinstance(result_path, dict):
                result_path = result_path.get('path') or result_path.get('url')

        if result_path:
            result_path = crop_white_padding(str(result_path))
            saved_url   = upload_to_s3(result_path, view_name)
            if not saved_url:
                saved_url = save_result_to_media(result_path, view_name)
            print(f"✅ {view_name} saved: {saved_url}")
            return saved_url
        else:
            print(f"⚠️ Leffa returned empty result for {view_name} — using original photo")
            return person_url

    except Exception as e:
        print(f"❌ Leffa failed for {view_name}: {e} — using original photo")
        return person_url
    finally:
        for p in [raw_person_path, person_path]:
            if p and os.path.exists(p):
                try: os.unlink(p)
                except Exception: pass


# ── STYLE ANALYSIS ────────────────────────────────────────────
def analyze_style(category):
    feedback_map = {
        'tshirt': (8.2, "The t-shirt fits well at the shoulders and chest. The length is appropriate for your body type."),
        'shirt':  (8.5, "The shirt drapes cleanly across the shoulders. The fit looks professional and sharp."),
        'jeans':  (8.0, "The jeans sit well at the waist. The leg length looks proportionate to your height."),
        'pants':  (7.9, "The pants fit well around the waist. Consider a belt for a more polished look."),
        'dress':  (9.0, "The dress flows beautifully. The length and silhouette complement your body shape."),
        'jacket': (8.7, "The jacket shoulders align perfectly. The overall fit looks sharp and well-structured."),
    }
    return feedback_map.get(category, (8.0, "The outfit fits well overall. Looks great on you!"))


# ══════════════════════════════════════════════════════════════
# MAIN CELERY TASK
# ══════════════════════════════════════════════════════════════

@shared_task(bind=True, max_retries=0)
def run_tryon_pipeline(self, job_id):

    print(f"\n{'='*50}")
    print(f"🚀 Starting job: {job_id}")
    print(f"{'='*50}")

    job = tryon_jobs_col.find_one({'_id': ObjectId(job_id)})
    if not job:
        print(f"❌ Job not found: {job_id}")
        return

    tryon_jobs_col.update_one(
        {'_id': ObjectId(job_id)},
        {'$set': {'status': 'processing'}}
    )

    try:
        # ── Step 1: Get body upload ──────────────────────────────
        body = body_uploads_col.find_one({'_id': ObjectId(job['body_upload_id'])})
        if not body:
            raise Exception('Body upload not found')
        print(f"✅ Body upload: {body.get('_id')}")

        # ── Step 2: Get clothing item ────────────────────────────
        clothing_item_id = str(job['clothing_item_id'])
        print(f"🔍 Looking for clothing: {clothing_item_id}")

        clothing = clothing_col.find_one({'id': clothing_item_id})

        if not clothing:
            try:
                clothing = clothing_col.find_one({'_id': ObjectId(clothing_item_id)})
            except Exception:
                pass

        if not clothing:
            clothing = clothing_col.find_one({'_id': clothing_item_id})

        if not clothing:
            sample = list(clothing_col.find().limit(3))
            sample_ids = [(str(s.get('_id')), s.get('id'), s.get('name')) for s in sample]
            print(f"❌ Clothing not found. Sample items: {sample_ids}")
            raise Exception(f'Clothing item not found: {clothing_item_id}')

        print(f"✅ Clothing: {clothing.get('name')}")

        garment_url  = clothing.get('image_url') or clothing.get('image')
        category     = clothing.get('category', 'tshirt')
        garment_type = get_garment_type(category)

        print(f"👗 URL: {garment_url}")
        print(f"👗 Type: {category} → {garment_type}")

        if not garment_url:
            raise Exception('No image URL on clothing item')

        # ── Step 3: Download & prep garment image ────────────────
        raw_garment_path = download_to_temp(garment_url)
        if not raw_garment_path:
            raise Exception('Failed to download garment image')

        garment_path = compress_and_prep_image(raw_garment_path)

        # ── Step 4: Get person photo URLs ────────────────────────
        front_url = body.get('front_url')
        back_url  = body.get('back_url')
        side_url  = body.get('side_url')

        print(f"\n📸 front: {bool(front_url)}")
        print(f"📸 back:  {bool(back_url)}")
        print(f"📸 side:  {bool(side_url)}")

        # ── Step 5: Connect to Leffa ONCE ────────────────────────
        leffa_client = get_leffa_client()

        # ── Step 6: Process views ────────────────────────────────
        # ALWAYS process front view
        front_result = process_one_view_with_leffa(
            leffa_client, front_url, garment_path, garment_type, 'front'
        )

        # OPTIMIZATION FOR FREE HF QUOTA:
        # Runs back/side views only if PRODUCTION_MODE is set in .env.
        is_production = os.getenv('PRODUCTION_MODE', 'false').lower() == 'true'

        if is_production:
            back_result = process_one_view_with_leffa(
                leffa_client, back_url, garment_path, garment_type, 'back'
            )
            side_result = process_one_view_with_leffa(
                leffa_client, side_url, garment_path, garment_type, 'side'
            )
        else:
            print("⚡ DEV MODE: Reusing original back & side photos to save GPU quota.")
            back_result = back_url
            side_result = side_url

        print(f"\n📊 Results:")
        print(f"  FRONT: {front_result}")
        print(f"  BACK:  {back_result}")
        print(f"  SIDE:  {side_result}")

        # Cleanup temp garments
        for p in [raw_garment_path, garment_path]:
            if p and os.path.exists(p):
                try: os.unlink(p)
                except Exception: pass

        # ── Step 7: Style analysis ───────────────────────────────
        style_score, style_feedback = analyze_style(category)

        # ── Step 8: Save result to MongoDB ───────────────────────
        tryon_jobs_col.update_one(
            {'_id': ObjectId(job_id)},
            {'$set': {
                'status':         'done',
                'front_result':   front_result,
                'back_result':    back_result,
                'side_result':    side_result,
                'style_score':    style_score,
                'style_feedback': style_feedback,
                'completed_at':   datetime.utcnow(),
            }}
        )

        print(f"\n{'='*50}")
        print(f"✅ Job {job_id} done!")
        print(f"{'='*50}\n")

    except Exception as e:
        print(f"\n❌ Job {job_id} failed: {e}")
        tryon_jobs_col.update_one(
            {'_id': ObjectId(job_id)},
            {'$set': {'status': 'failed', 'error': str(e)}}
        )
        raise e