from celery import shared_task
from datetime import datetime
from bson import ObjectId
import requests
import cv2
import numpy as np
import boto3
import uuid
import os

from .db import tryon_jobs_col, body_uploads_col, clothing_col


# ── HELPER: Download image from URL ───────────────────────────
def download_image(url):
    """
    Downloads an image from S3 URL
    Returns it as a numpy array (OpenCV format)

    numpy array is what OpenCV and PyTorch work with
    Shape: (height, width, channels)
    """
    response = requests.get(url)
    img_array = np.frombuffer(response.content, dtype=np.uint8)
    return cv2.imdecode(img_array, cv2.IMREAD_COLOR)


# ── HELPER: Upload result image to S3 ─────────────────────────
def upload_result_to_s3(img_array, view_name):
    """
    Uploads ML result image to S3
    Returns the public URL

    view_name = 'front' / 'back' / 'left' / 'right'
    """
    s3 = boto3.client(
        's3',
        aws_access_key_id     = os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key = os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name           = os.getenv('AWS_REGION', 'ap-south-1'),
    )
    bucket = os.getenv('AWS_STORAGE_BUCKET')
    key    = f"results/{uuid.uuid4()}_{view_name}.jpg"

    # Convert numpy array → JPEG bytes → upload
    _, buffer = cv2.imencode('.jpg', img_array)
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=buffer.tobytes(),
        ContentType='image/jpeg',
    )

    return f"https://{bucket}.s3.amazonaws.com/{key}"


# ── STAGE 1: Body Segmentation ────────────────────────────────
def segment_body(image):
    """
    Uses SAM (Segment Anything Model) to isolate
    the person from the background

    Input:  numpy array (original photo)
    Output: numpy array (body mask — white=body, black=background)

    In real implementation:
    from segment_anything import sam_model_registry, SamPredictor
    SAM loaded once at module level (not per request)
    """
    # Placeholder — returns grayscale version as mock mask
    # Replace with real SAM inference:
    # predictor.set_image(image)
    # masks, _, _ = predictor.predict(...)
    # return masks[0]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
    return mask


# ── STAGE 2: Pose Estimation ──────────────────────────────────
def estimate_pose(image):
    """
    Uses OpenPose / DWPose to detect 18 body keypoints

    Keypoints include:
    nose, neck, shoulders, elbows, wrists,
    hips, knees, ankles, eyes, ears

    Input:  numpy array (person photo)
    Output: dict of 18 keypoint coordinates
    {
        'nose':           (x, y),
        'left_shoulder':  (x, y),
        'right_shoulder': (x, y),
        ...
    }

    In real implementation:
    from openpose import OpenPose
    keypoints = openpose.detect(image)
    """
    # Placeholder — returns mock keypoints
    h, w = image.shape[:2]
    return {
        'nose':            (w//2, int(h*0.1)),
        'neck':            (w//2, int(h*0.2)),
        'left_shoulder':   (int(w*0.35), int(h*0.25)),
        'right_shoulder':  (int(w*0.65), int(h*0.25)),
        'left_elbow':      (int(w*0.25), int(h*0.4)),
        'right_elbow':     (int(w*0.75), int(h*0.4)),
        'left_wrist':      (int(w*0.2),  int(h*0.55)),
        'right_wrist':     (int(w*0.8),  int(h*0.55)),
        'left_hip':        (int(w*0.4),  int(h*0.55)),
        'right_hip':       (int(w*0.6),  int(h*0.55)),
    }


# ── STAGE 3: Garment Warping ──────────────────────────────────
def warp_garment(garment_image, keypoints):
    """
    Uses TPS (Thin Plate Spline) transformation
    to warp the garment to fit the person's pose

    TPS maps control points on garment
    to corresponding body keypoints from OpenPose

    Input:
        garment_image: numpy array (clothing item photo)
        keypoints:     dict of body keypoints from Stage 2

    Output: numpy array (warped garment)

    In real implementation use VITON-HD or CP-VTON:
    from viton import VITONModel
    warped = viton_model.warp(garment_image, keypoints)
    """
    # Placeholder — resizes garment to fit body area
    # Replace with real TPS warping
    h, w = garment_image.shape[:2]
    shoulder_y = keypoints['left_shoulder'][1]
    hip_y      = keypoints['left_hip'][1]
    target_h   = hip_y - shoulder_y
    target_w   = int(w * (target_h / h))
    warped     = cv2.resize(garment_image, (target_w, target_h))
    return warped


# ── STAGE 4: Blending ─────────────────────────────────────────
def blend_images(person_image, warped_garment, body_mask, keypoints):
    """
    Uses OpenCV to composite the warped garment
    onto the person photo

    Steps:
    1. Position garment at shoulder keypoint
    2. Use body mask to blend edges naturally
    3. Combine person + garment into final image

    Input:
        person_image:   original person photo
        warped_garment: output from Stage 3
        body_mask:      output from Stage 1
        keypoints:      body keypoints from Stage 2

    Output: numpy array (final try-on result)
    """
    result = person_image.copy()

    # Get position to place garment
    x = keypoints['left_shoulder'][0]
    y = keypoints['left_shoulder'][1]

    gh, gw = warped_garment.shape[:2]

    # Make sure garment fits within image bounds
    y2 = min(y + gh, result.shape[0])
    x2 = min(x + gw, result.shape[1])

    # Place warped garment on person
    result[y:y2, x:x2] = warped_garment[:y2-y, :x2-x]

    return result


# ── STAGE 5: Style Analysis ───────────────────────────────────
def analyze_style(person_image, result_image):
    """
    Analyzes how well the outfit fits
    Returns a score and text feedback

    In real implementation use:
    - A fine-tuned CNN to score fit quality
    - GPT-4 Vision / LLaMA Vision for text feedback

    Input:
        person_image: original photo
        result_image: try-on result

    Output:
        score:    float (0-10)
        feedback: string
    """
    # Placeholder scores
    # Replace with real ML scoring model
    score    = 8.2
    feedback = (
        "The outfit fits well at the shoulders and chest. "
        "The length is appropriate for your body type. "
        "Consider trying one size down for a slimmer fit."
    )
    return score, feedback


# ══════════════════════════════════════════════════════════════
# MAIN CELERY TASK
# ══════════════════════════════════════════════════════════════

@shared_task
def run_tryon_pipeline(job_id):
    """
    Main Celery task — runs the full ML pipeline

    Called by views.py:
    run_tryon_pipeline.delay(job_id)
    ↑ .delay() means run in background worker
      returns immediately, doesn't block the API

    Steps:
    1. Load job from MongoDB
    2. Load body photos + clothing image from S3
    3. Run 4-stage ML pipeline on each view
    4. Upload results to S3
    5. Update job status to done in MongoDB

    React polls /api/tryon/status/<job_id>/
    every 2 seconds to check if done
    """

    # ── Step 1: Get job from MongoDB ──────────────────────────
    job = tryon_jobs_col.find_one({'_id': ObjectId(job_id)})

    if not job:
        print(f'❌ Job {job_id} not found')
        return

    # ── Update status to processing ───────────────────────────
    tryon_jobs_col.update_one(
        {'_id': ObjectId(job_id)},
        {'$set': {'status': 'processing'}}
        # ↑ $set updates only specified fields
        # Other fields remain unchanged
    )

    try:
        # ── Step 2: Get body upload and clothing item ──────────
        body = body_uploads_col.find_one(
            {'_id': ObjectId(job['body_upload_id'])}
        )
        clothing = clothing_col.find_one(
            {'_id': ObjectId(job['clothing_item_id'])}
        )

        if not body or not clothing:
            raise Exception('Body upload or clothing item not found')

        # ── Step 3: Download clothing image ───────────────────
        garment_image = download_image(clothing['image_url'])

        # ── Step 4: Process each of the 4 views ───────────────
        views = {
            'front': body['front_url'],
            'back':  body['back_url'],
            'left':  body['left_url'],
            'right': body['right_url'],
        }

        results = {}

        for view_name, url in views.items():
            print(f'Processing {view_name} view...')

            # Download person photo for this view
            person_image = download_image(url)

            # Stage 1 — Segment body
            body_mask = segment_body(person_image)

            # Stage 2 — Detect pose keypoints
            keypoints = estimate_pose(person_image)

            # Stage 3 — Warp garment to fit pose
            warped_garment = warp_garment(garment_image, keypoints)

            # Stage 4 — Blend garment onto person
            result_image = blend_images(
                person_image,
                warped_garment,
                body_mask,
                keypoints
            )

            # Upload result to S3
            result_url = upload_result_to_s3(result_image, view_name)
            results[f'{view_name}_result'] = result_url

        # ── Step 5: Style analysis on front view ──────────────
        front_person = download_image(body['front_url'])
        front_result = download_image(results['front_result'])
        style_score, style_feedback = analyze_style(
            front_person,
            front_result
        )

        # ── Step 6: Update job as done in MongoDB ─────────────
        tryon_jobs_col.update_one(
            {'_id': ObjectId(job_id)},
            {'$set': {
                'status':         'done',
                'front_result':   results['front_result'],
                'back_result':    results['back_result'],
                'left_result':    results['left_result'],
                'right_result':   results['right_result'],
                'style_score':    style_score,
                'style_feedback': style_feedback,
                'completed_at':   datetime.utcnow(),
            }}
        )

        print(f'✅ Job {job_id} completed successfully')

    except Exception as e:
        # ── If anything fails, mark job as failed ─────────────
        tryon_jobs_col.update_one(
            {'_id': ObjectId(job_id)},
            {'$set': {
                'status': 'failed',
                'error':  str(e),
            }}
        )
        print(f'❌ Job {job_id} failed: {e}')
        raise e