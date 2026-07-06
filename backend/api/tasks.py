from celery import shared_task
from datetime import datetime
from bson import ObjectId
import os

from .db import tryon_jobs_col, body_uploads_col, clothing_col

# ── Heavy ML imports — wrapped so app doesn't crash if not installed ──
try:
    import cv2
    import numpy as np
    import requests
    import boto3
    import uuid
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print('⚠️  cv2/numpy not installed — ML pipeline will not run')


# ── HELPERS ───────────────────────────────────────────────────
def download_image(url):
    if not CV2_AVAILABLE:
        return None
    import requests
    import numpy as np
    response = requests.get(url)
    img_array = np.frombuffer(response.content, dtype=np.uint8)
    return cv2.imdecode(img_array, cv2.IMREAD_COLOR)


def upload_result_to_s3(img_array, view_name):
    if not CV2_AVAILABLE or img_array is None:
        return None

    bucket = os.getenv('AWS_STORAGE_BUCKET')
    access_key = os.getenv('AWS_ACCESS_KEY_ID')
    secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')

    # ── LOCAL FALLBACK SYSTEM (If AWS credentials are left empty) ──
    if not bucket or not access_key or not secret_key:
        import uuid
        print("ℹ️ AWS credentials empty — Saving processing results to local storage")
        
        # Define local path inside a media directory
        local_filename = f"{uuid.uuid4()}_{view_name}.jpg"
        media_dir = os.path.join(os.getcwd(), 'media', 'results')
        
        # Make sure the local directory safely exists
        os.makedirs(media_dir, exist_ok=True)
        
        full_path = os.path.join(media_dir, local_filename)
        
        # Save the image via OpenCV locally
        cv2.imwrite(full_path, img_array)
        
        # Return a relative URL path that your Django media route can serve
        return f"http://127.0.0.1:8000/media/results/{local_filename}"

    # ── ORIGINAL AWS S3 PRODUCTION LOGIC ──
    import boto3, uuid
    s3 = boto3.client(
        's3',
        aws_access_key_id     = access_key,
        aws_secret_access_key = secret_key,
        region_name           = os.getenv('AWS_REGION', 'ap-south-1'),
    )
    
    key = f"results/{uuid.uuid4()}_{view_name}.jpg"
    _, buffer = cv2.imencode('.jpg', img_array)
    
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=buffer.tobytes(),
        ContentType='image/jpeg',
    )
    return f"https://{bucket}.s3.amazonaws.com/{key}"


def segment_body(image):
    if not CV2_AVAILABLE or image is None:
        return None
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    return mask


def estimate_pose(image):
    if image is None:
        return {}
    h, w = image.shape[:2]
    return {
        'nose':           (w//2,          int(h*0.1)),
        'neck':           (w//2,          int(h*0.2)),
        'left_shoulder':  (int(w*0.35),   int(h*0.25)),
        'right_shoulder': (int(w*0.65),   int(h*0.25)),
        'left_elbow':     (int(w*0.25),   int(h*0.4)),
        'right_elbow':    (int(w*0.75),   int(h*0.4)),
        'left_wrist':     (int(w*0.2),    int(h*0.55)),
        'right_wrist':    (int(w*0.8),    int(h*0.55)),
        'left_hip':       (int(w*0.4),    int(h*0.55)),
        'right_hip':      (int(w*0.6),    int(h*0.55)),
    }


def warp_garment(garment_image, keypoints):
    if not CV2_AVAILABLE or garment_image is None:
        return None
    h, w       = garment_image.shape[:2]
    shoulder_y = keypoints.get('left_shoulder', (0, int(h*0.2)))[1]
    hip_y      = keypoints.get('left_hip',      (0, int(h*0.6)))[1]
    target_h   = max(hip_y - shoulder_y, 10)
    target_w   = int(w * (target_h / h))
    return cv2.resize(garment_image, (target_w, target_h))


def blend_images(person_image, warped_garment, body_mask, keypoints):
    if not CV2_AVAILABLE or person_image is None or warped_garment is None:
        return person_image
    result = person_image.copy()
    x  = keypoints.get('left_shoulder', (0, 0))[0]
    y  = keypoints.get('left_shoulder', (0, 0))[1]
    gh, gw = warped_garment.shape[:2]
    y2 = min(y + gh, result.shape[0])
    x2 = min(x + gw, result.shape[1])
    result[y:y2, x:x2] = warped_garment[:y2-y, :x2-x]
    return result


def analyze_style(person_image, result_image):
    return 8.2, (
        "The outfit fits well at the shoulders and chest. "
        "The length is appropriate for your body type. "
        "Consider trying one size down for a slimmer fit."
    )


# ── MAIN CELERY TASK ──────────────────────────────────────────
@shared_task
def run_tryon_pipeline(job_id):
    job = tryon_jobs_col.find_one({'_id': ObjectId(job_id)})
    if not job:
        return

    tryon_jobs_col.update_one(
        {'_id': ObjectId(job_id)},
        {'$set': {'status': 'processing'}}
    )

    try:
        body     = body_uploads_col.find_one({'_id': ObjectId(job['body_upload_id'])})
        clothing = clothing_col.find_one({'_id': ObjectId(job['clothing_item_id'])})

        if not body or not clothing:
            raise Exception('Body upload or clothing item not found')

        garment_image = download_image(clothing['image_url'])

        views = {
            'front': body.get('front_url') or body.get('front'),
            'back':  body.get('back_url') or body.get('back'),
            'side':  body.get('side_url') or body.get('side'),
        }

        results = {}

        for view_name, url in views.items():
            person_image   = download_image(url)
            body_mask      = segment_body(person_image)
            keypoints      = estimate_pose(person_image)
            warped_garment = warp_garment(garment_image, keypoints)
            result_image   = blend_images(person_image, warped_garment, body_mask, keypoints)
            result_url     = upload_result_to_s3(result_image, view_name)
            results[f'{view_name}_result'] = result_url

        front_person = download_image(body['front_url'])
        front_result = download_image(results.get('front_result', ''))
        style_score, style_feedback = analyze_style(front_person, front_result)

        tryon_jobs_col.update_one(
            {'_id': ObjectId(job_id)},
            {'$set': {
                'status':         'done',
                'front_result':   results.get('front_result'),
                'back_result':    results.get('back_result'),
                'side_result':    results.get('side_result'),
                'style_score':    style_score,
                'style_feedback': style_feedback,
                'completed_at':   datetime.utcnow(),
            }}
        )

    except Exception as e:
        tryon_jobs_col.update_one(
            {'_id': ObjectId(job_id)},
            {'$set': {'status': 'failed', 'error': str(e)}}
        )
        raise e