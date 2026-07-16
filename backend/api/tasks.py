from celery import shared_task
from datetime import datetime
from bson import ObjectId
import os
import requests
import uuid
import shutil
import time

from .db import tryon_jobs_col, body_uploads_col, clothing_col


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

        backend_url = os.getenv('BACKEND_URL', 'http://127.0.0.1:8000')
        return f"{backend_url}/media/results/{filename}"
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
        from PIL import Image
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


# ── CORE: Run Leffa with retry ────────────────────────────────
def run_leffa(person_path, garment_path, garment_type='upper_body', max_retries=3):
    """
    Runs Leffa with automatic retry on failure.
    HF Space sometimes sleeps — retry wakes it up.
    """
    from gradio_client import Client, handle_file

    for attempt in range(1, max_retries + 1):
        try:
            print(f"🔌 Connecting to Leffa (attempt {attempt}/{max_retries})...")
            client = Client("franciszzj/Leffa")
            print("✅ Connected")
            print(f"🚀 Running try-on ({garment_type})...")

            # Updated parameters for higher generation quality
            num_inference_steps = 50  # Increased from 30 for better quality/details
            guidance_scale = 3.0     # Tuned within the recommended 2.5 - 3.5 sweet spot

            result = client.predict(
                handle_file(person_path),
                handle_file(garment_path),
                False,                # src_image_bound
                num_inference_steps,  # 30 -> changed to 50
                guidance_scale,       # 2.5 -> changed to 3.0
                42,                   # seed
                "viton_hd",           # target_model
                garment_type,
                False,                # is_real_time
                api_name="/leffa_predict_vt"
            )

            print(f"📦 Raw result: {result}")

            if result and isinstance(result, (list, tuple)):
                result_path = result[0]
                if isinstance(result_path, dict):
                    result_path = result_path.get('path') or result_path.get('url')
                if result_path:
                    print(f"✅ Result path: {result_path}")
                    return str(result_path)

            print(f"⚠️ Empty result on attempt {attempt}")

        except Exception as e:
            print(f"❌ Attempt {attempt} failed: {type(e).__name__}: {e}")
            if attempt < max_retries:
                wait = attempt * 10
                print(f"⏳ Waiting {wait}s before retry...")
                time.sleep(wait)

    print(f"❌ All {max_retries} attempts failed")
    return None


# ── HELPER: Garment type mapping ─────────────────────────────
def get_garment_type(category):
    upper = ['tshirt', 'shirt', 'jacket']
    lower = ['jeans', 'pants']
    dress = ['dress']
    if category in upper:   return 'upper_body'
    elif category in lower: return 'lower_body'
    elif category in dress: return 'dresses'
    else:                   return 'upper_body'


# ── HELPER: Process one view ──────────────────────────────────
def process_view(person_url, garment_path, garment_type, view_name):
    """
    Returns (url, ai_applied) — ai_applied is False whenever we fell
    back to the original photo (quota exceeded, timeout, any failure),
    so the frontend can tell the difference between a real try-on
    result and an unedited photo instead of both looking identical.
    """
    print(f"\n--- {view_name.upper()} view ---")

    if not person_url:
        print(f"⚠️ No URL for {view_name}")
        return None, False

    person_path = download_to_temp(person_url)
    if not person_path:
        print(f"⚠️ Download failed for {view_name} — using original")
        return person_url, False

    try:
        result_path = run_leffa(person_path, garment_path, garment_type)

        if result_path:
            result_path = crop_white_padding(result_path)
            saved_url   = upload_to_s3(result_path, view_name)
            if not saved_url:
                saved_url = save_result_to_media(result_path, view_name)
            print(f"✅ {view_name} saved: {saved_url}")
            return saved_url, True
        else:
            print(f"⚠️ Leffa failed for {view_name} — using original photo")
            return person_url, False

    except Exception as e:
        print(f"❌ {view_name} error: {e}")
        return person_url, False
    finally:
        try: os.unlink(person_path)
        except: pass


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
        # ── Get body upload ──────────────────────────────
        body = body_uploads_col.find_one({'_id': ObjectId(job['body_upload_id'])})
        if not body:
            raise Exception('Body upload not found')
        print(f"✅ Body upload: {body.get('_id')}")

        # ── Get clothing item ────────────────────────────
        # FIX: search by both 'id' (p001) AND '_id' (ObjectId)
        clothing_item_id = str(job['clothing_item_id'])
        print(f"🔍 Looking for clothing: {clothing_item_id}")

        clothing = clothing_col.find_one({'id': clothing_item_id})

        if not clothing:
            # Try as ObjectId
            try:
                clothing = clothing_col.find_one({'_id': ObjectId(clothing_item_id)})
            except Exception:
                pass

        if not clothing:
            # Try by MongoDB _id as string (when serializer returns str(_id))
            clothing = clothing_col.find_one({'_id': clothing_item_id})

        if not clothing:
            # Last resort — list all and show what we have
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

        # ── Download garment once ────────────────────────
        garment_path = download_to_temp(garment_url)
        if not garment_path:
            raise Exception('Failed to download garment image')

        # ── Get person photo URLs ────────────────────────
        front_url = body.get('front_url')
        back_url  = body.get('back_url')
        side_url  = body.get('side_url')

        print(f"\n📸 front: {bool(front_url)}")
        print(f"📸 back:  {bool(back_url)}")
        print(f"📸 side:  {bool(side_url)}")

        # ── Run Leffa explicitly on each view ────────────
        # NOTE: Explicit calls — NOT a loop — guarantees order
        front_result, front_ai = process_view(front_url, garment_path, garment_type, 'front')
        back_result, back_ai  = process_view(back_url,  garment_path, garment_type, 'back')
        side_result, side_ai  = process_view(side_url,  garment_path, garment_type, 'side')

        ai_applied_any = front_ai or back_ai or side_ai

        print(f"\n📊 Results:")
        print(f"  FRONT: {front_result}")
        print(f"  BACK:  {back_result}")
        print(f"  SIDE:  {side_result}")

        try: os.unlink(garment_path)
        except: pass

        # ── Style analysis ───────────────────────────────
        style_score, style_feedback = analyze_style(category)

        # ── Save to MongoDB ──────────────────────────────
        tryon_jobs_col.update_one(
            {'_id': ObjectId(job_id)},
            {'$set': {
                'status':         'done',
                'front_result':   front_result,
                'back_result':    back_result,
                'side_result':    side_result,
                'front_ai_applied': front_ai,
                'back_ai_applied': back_ai,
                'side_ai_applied': side_ai,
                'ai_applied':     ai_applied_any,
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