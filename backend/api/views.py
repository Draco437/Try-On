import boto3
import uuid
from datetime import datetime, timezone

from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.core.files.storage import FileSystemStorage

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken

from .db import (
    body_uploads_col,
    preferences_col,
    clothing_col,
    tryon_jobs_col,
)
from .serializers import (
    serialize_user,
    serialize_body_upload,
    serialize_preference,
    serialize_clothing_item,
    serialize_tryon_job,
    serialize_list,
)
from .tasks import run_tryon_pipeline

import os

# ── HELPER: Generate JWT tokens ───────────────────────────────
def get_tokens_for_user(user):
    """
    Given a Django User object
    Returns access + refresh JWT tokens

    React stores these in localStorage
    and sends access token with every request:
    Authorization: Bearer <access_token>
    """
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access':  str(refresh.access_token),
    }


# ── HELPER: Upload file to S3 ─────────────────────────────────
def upload_to_s3(file_obj, folder='uploads'):
    """
    Uploads a file to AWS S3
    Returns the public URL of the uploaded file

    folder = subfolder inside S3 bucket
    'body'    → for body photos
    'garment' → for clothing images
    'results' → for ML output images
    """
    s3 = boto3.client(
        's3',
        aws_access_key_id     = os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key = os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name           = os.getenv('AWS_REGION', 'ap-south-1'),
    )
    bucket = os.getenv('AWS_STORAGE_BUCKET')
    key    = f"{folder}/{uuid.uuid4()}.jpg"

    s3.upload_fileobj(file_obj, bucket, key)

    return f"https://{bucket}.s3.amazonaws.com/{key}"


# ═══════════════════════════════════════════════════════════════
# AUTH VIEWS
# ═══════════════════════════════════════════════════════════════

class RegisterView(APIView):
    """
    POST /api/auth/register/
    
    React sends:
    {
        "username": "john",
        "email": "john@example.com",
        "password": "secret123"
    }

    We:
    1. Check username/email not already taken
    2. Create Django User (password is hashed automatically)
    3. Return JWT tokens + user data

    React receives:
    {
        "user": { "id": 1, "username": "john", ... },
        "tokens": { "access": "...", "refresh": "..." }
    }
    """
    permission_classes = [AllowAny]
    # ↑ Anyone can register — no token needed

    def post(self, request):
        username = request.data.get('username', '').strip()
        email    = request.data.get('email', '').strip()
        password = request.data.get('password', '')

        # ── Validate ──
        if not username or not email or not password:
            return Response(
                {'error': 'Username, email and password are required'},
                status=400
            )

        if User.objects.filter(username=username).exists():
            return Response(
                {'error': 'Username already taken'},
                status=400
            )

        if User.objects.filter(email=email).exists():
            return Response(
                {'error': 'Email already registered'},
                status=400
            )

        # ── Create user ──
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            # ↑ create_user hashes the password automatically
            # Never store plain text passwords
        )

        tokens = get_tokens_for_user(user)

        return Response({
            'user':   serialize_user(user),
            'tokens': tokens,
        }, status=201)


class LoginView(APIView):
    """
    POST /api/auth/login/

    React sends:
    {
        "username": "john",
        "password": "secret123"
    }

    We:
    1. Authenticate username + password against Django auth
    2. If valid → return JWT tokens
    3. If invalid → return error

    React receives:
    {
        "user": { "id": 1, "username": "john", ... },
        "tokens": { "access": "...", "refresh": "..." }
    }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '')
        password = request.data.get('password', '')

        # ── authenticate checks username + hashed password ──
        user = authenticate(username=username, password=password)

        if not user:
            return Response(
                {'error': 'Invalid username or password'},
                status=401
            )

        tokens = get_tokens_for_user(user)

        return Response({
            'user':   serialize_user(user),
            'tokens': tokens,
        })


class LogoutView(APIView):
    """
    POST /api/auth/logout/

    React sends the refresh token
    We blacklist it so it can't be used again

    React receives:
    { "message": "Logged out successfully" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            # ↑ Adds token to blacklist so it can't generate
            # new access tokens
        except Exception:
            pass

        return Response({'message': 'Logged out successfully'})


# ═══════════════════════════════════════════════════════════════
# BODY UPLOAD VIEWS
# ═══════════════════════════════════════════════════════════════

class BodyUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ── Check all 3 images are present ──
        required = ['front', 'back', 'side']
        for view in required:
            if view not in request.FILES:
                return Response(
                    {'error': f'Missing image: {view}'},
                    status=400
                )

        try:
            bucket = os.getenv('AWS_STORAGE_BUCKET')
            access_key = os.getenv('AWS_ACCESS_KEY_ID')
            
            # ── Hybrid Local / S3 File Saving Engine ──
            if not bucket or not access_key:
                # Local Development Fallback
                fs = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'uploads'), base_url='/media/uploads/')
                
                front_file = request.FILES['front']
                back_file = request.FILES['back']
                side_file = request.FILES['side']
                
                # Save locally to your media directory
                front_name = fs.save(front_file.name, front_file)
                back_name = fs.save(back_file.name, back_file)
                side_name = fs.save(side_file.name, side_file)
                
                BACKEND_URL = os.getenv('BACKEND_URL', 'http://127.0.0.1:8000')
                
                front_url = f"{BACKEND_URL}{fs.url(front_name)}"
                back_url = f"{BACKEND_URL}{fs.url(back_name)}"
                side_url = f"{BACKEND_URL}{fs.url(side_name)}"
                
            else:
                # Production S3 Logic (runs when credentials exist)
                front_url = upload_to_s3(request.FILES['front'], 'body')
                back_url  = upload_to_s3(request.FILES['back'],  'body')
                side_url  = upload_to_s3(request.FILES['side'],  'body')

        except Exception as e:
            return Response(
                {'error': f'File storage processing failed: {str(e)}'},
                status=500
            )

        # ── Save to MongoDB ──
        doc = {
            'user_id':     request.user.id,
            'front_url':   front_url,
            'back_url':    back_url,
            'side_url':    side_url,
            'uploaded_at': datetime.now(timezone.utc), # Clean timezone-aware alternative to utcnow()
        }
        result = body_uploads_col.insert_one(doc)
        doc['_id'] = result.inserted_id

        return Response(serialize_body_upload(doc), status=201)

    def get(self, request):
        """
        GET /api/body/upload/
        Returns the most recent body upload for this user
        """
        doc = body_uploads_col.find_one(
            {'user_id': request.user.id},
            sort=[('uploaded_at', -1)]
        )
        if not doc:
            return Response({'error': 'No upload found'}, status=404)

        return Response(serialize_body_upload(doc))


# ═══════════════════════════════════════════════════════════════
# PREFERENCE VIEWS
# ═══════════════════════════════════════════════════════════════

class PreferenceView(APIView):
    """
    POST /api/preferences/

    React sends quiz answers:
    {
        "gender": "M",
        "clothing": "tshirt",
        "size": "L",
        "material": "cotton",
        "color": "blue",
        "occasion": "casual"
    }

    We:
    1. Delete old preference (one per user)
    2. Save new preference to MongoDB
    3. Return saved preference

    GET /api/preferences/
    Returns current user preference
    React uses this to pre-fill quiz if user
    has done it before
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        gender   = request.data.get('gender')
        clothing = request.data.get('clothing')
        size     = request.data.get('size')
        material = request.data.get('material', '')
        color    = request.data.get('color', '')
        occasion = request.data.get('occasion', '')

        if not gender or not clothing or not size:
            return Response(
                {'error': 'Gender, clothing and size are required'},
                status=400
            )

        # ── Delete old preference if exists ──
        preferences_col.delete_one({'user_id': request.user.id})

        # ── Save new preference ──
        doc = {
            'user_id':  request.user.id,
            'gender':   gender,
            'clothing': clothing,
            'size':     size,
            'material': material,
            'color':    color,
            'occasion': occasion,
        }
        result = preferences_col.insert_one(doc)
        doc['_id'] = result.inserted_id

        return Response(serialize_preference(doc), status=201)

    def get(self, request):
        doc = preferences_col.find_one({'user_id': request.user.id})
        if not doc:
            return Response({'error': 'No preference found'}, status=404)
        return Response(serialize_preference(doc))


# ═══════════════════════════════════════════════════════════════
# CLOTHING / RECOMMENDATION VIEWS
# ═══════════════════════════════════════════════════════════════

class RecommendationView(APIView):
    """
    GET /api/recommend/

    We:
    1. Get user preference from MongoDB
    2. Filter clothing_items by preference
    3. Return matching items

    React receives:
    [
        {
            "id": "...",
            "name": "Blue Cotton T-Shirt",
            "category": "tshirt",
            "size": "L",
            "image_url": "...",
            "price": 599
        },
        ...
    ]
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # ── Get user preference ──
        pref = preferences_col.find_one({'user_id': request.user.id})

        if not pref:
            return Response(
                {'error': 'Please complete the quiz first'},
                status=400
            )

        # ── Build MongoDB filter from preference ──
        query = {
            'category': pref.get('clothing'),
            'gender':   pref.get('gender'),
        }

        # Add size filter only if provided
        if pref.get('size'):
            query['size'] = pref['size']

        # Add material filter only if provided
        if pref.get('material'):
            query['material'] = pref['material']

        # ── Query MongoDB ──
        items = list(clothing_col.find(query))

        # ── If no exact match, broaden search ──
        if not items:
            items = list(clothing_col.find({
                'category': pref.get('clothing'),
                'gender':   pref.get('gender'),
            }))

        return Response(serialize_list(items, serialize_clothing_item))


class ClothingItemView(APIView):
    """
    GET /api/clothing/<item_id>/
    Returns a single clothing item by ID
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, item_id):
        from bson import ObjectId

        # ── 1. Check if 'item_id' matches standard '_id' or custom 'id' field as string ──
        doc = clothing_col.find_one({
            '$or': [
                {'_id': str(item_id)},
                {'id': str(item_id)}
            ]
        })
        
        # ── 2. Fallback to native ObjectId if it matches hex string layout ──
        if not doc:
            try:
                if len(item_id) == 24 and all(c in '0123456789abcdefABCDEF' for c in item_id):
                    doc = clothing_col.find_one({'_id': ObjectId(item_id)})
            except Exception:
                pass

        if not doc:
            return Response({'error': f'Clothing item {item_id} not found'}, status=404)

        return Response(serialize_clothing_item(doc))


class TryOnStartView(APIView):
    """
    POST /api/tryon/start/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from bson import ObjectId

        body_upload_id   = request.data.get('body_upload_id')
        clothing_item_id = request.data.get('clothing_item_id')

        if not body_upload_id or not clothing_item_id:
            return Response(
                {'error': 'body_upload_id and clothing_item_id required'},
                status=400
            )

        # ── Validate body upload belongs to this user ──
        try:
            body = body_uploads_col.find_one({
                '_id':     ObjectId(body_upload_id),
                'user_id': request.user.id,
            })
        except Exception:
            return Response({'error': 'Invalid body_upload_id'}, status=400)

        if not body:
            return Response({'error': 'Body upload not found'}, status=404)

        # ── 1. Check if 'clothing_item_id' matches standard '_id' or custom 'id' field ──
        clothing = clothing_col.find_one({
            '$or': [
                {'_id': str(clothing_item_id)},
                {'id': str(clothing_item_id)}
            ]
        })
        
        # ── 2. Fallback to native ObjectId format ──
        if not clothing:
            try:
                if isinstance(clothing_item_id, str) and len(clothing_item_id) == 24 and all(c in '0123456789abcdefABCDEF' for c in clothing_item_id):
                    clothing = clothing_col.find_one({'_id': ObjectId(clothing_item_id)})
            except Exception:
                pass

        if not clothing:
            return Response({'error': f'Clothing item {clothing_item_id} not found'}, status=404)

        # ── Create TryOnJob in MongoDB ──
        job = {
            'user_id':           request.user.id,
            'body_upload_id':    body_upload_id,
            'clothing_item_id':  str(clothing_item_id),
            'status':            'pending',
            'front_result':      None,
            'back_result':       None,
            'side_result':       None,
            'style_score':       None,
            'style_feedback':    None,
            'created_at':        datetime.utcnow(),
        }
        result = tryon_jobs_col.insert_one(job)
        job_id = str(result.inserted_id)

        # ── Fire Celery task ──
        run_tryon_pipeline.delay(job_id)

        return Response({'job_id': job_id}, status=201)


class TryOnStatusView(APIView):
    """
    GET /api/tryon/status/<job_id>/

    React polls this every 2 seconds

    Returns current job status:
    {
        "id": "64job...",
        "status": "processing",   ← pending/processing/done/failed
        "front_result": null,     ← null until done
        "back_result": null,
        "side_result": null,
        "style_score": null,
        "style_feedback": null
    }

    When status = done:
    {
        "status": "done",
        "front_result": "https://s3.../result_front.jpg",
        "back_result":  "https://s3.../result_back.jpg",
        "side_result":  "https://s3.../result_side.jpg",
        "style_score":    8.4,
        "style_feedback": "Fits well at shoulders..."
    }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        from bson import ObjectId

        try:
            job = tryon_jobs_col.find_one({
                '_id':     ObjectId(job_id),
                'user_id': request.user.id,
            })
        except Exception:
            return Response({'error': 'Invalid job ID'}, status=400)

        if not job:
            return Response({'error': 'Job not found'}, status=404)

        return Response(serialize_tryon_job(job))


# ═══════════════════════════════════════════════════════════════
# WARDROBE VIEW
# ═══════════════════════════════════════════════════════════════

class WardrobeView(APIView):
    """
    GET /api/wardrobe/

    Returns all completed try-on jobs for this user
    React shows these as saved try-on history

    React receives:
    [
        {
            "id": "...",
            "status": "done",
            "front_result": "https://s3...",
            ...
        },
        ...
    ]
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        jobs = list(tryon_jobs_col.find(
            {
                'user_id': request.user.id,
                'status':  'done',
            }
        ).sort('created_at', -1).limit(20))
        # ↑ sort by newest first, max 20 results

        return Response(serialize_list(jobs, serialize_tryon_job))


# ═══════════════════════════════════════════════════════════════
# PRODUCT MANAGEMENT VIEWS
# ═══════════════════════════════════════════════════════════════

class ProductCreateListView(APIView):
    """
    POST /api/products/
    Adds a custom user product to the global MongoDB clothing collection.
    
    GET /api/products/
    Returns all products in the catalog.
    """
    # Allow authenticated users to view/add custom items
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Fetch all global products from the database
        items = list(clothing_col.find({}))
        return Response(serialize_list(items, serialize_clothing_item), status=200)

    def post(self, request):
        name = request.data.get('name', '').strip()
        image_url = request.data.get('image', '').strip() 
        price = request.data.get('price', 0)
        
        # --- NORMALIZATION LOGIC TO MATCH DB SCHEMA ---
        raw_gender = request.data.get('gender', '')
        # Map "Male" -> "M" and "Female" -> "F"
        if raw_gender in ['Male', 'M', 'm']:
            gender = 'M'
        elif raw_gender in ['Female', 'F', 'f']:
            gender = 'F'
        else:
            gender = raw_gender

        # Map "Tshirt" -> "tshirt"
        raw_category = request.data.get('clothing', '')
        category = raw_category.strip().lower() if raw_category else ''

        # Map "Cotton" -> "cotton"
        raw_material = request.data.get('material', '')
        material = raw_material.strip().lower() if raw_material else ''

        # Ensure size is stored as an array of uppercase letters (e.g., ["L"])
        raw_size = request.data.get('size')
        if isinstance(raw_size, list):
            size = [s.strip().upper() for s in raw_size if isinstance(s, str)]
        elif isinstance(raw_size, str):
            size = [raw_size.strip().upper()]
        else:
            size = []

        # Ensure occasion is stored as an array of lowercase strings (e.g., ["casual"])
        raw_occasion = request.data.get('occasion', '')
        if isinstance(raw_occasion, list):
            occasion = [o.strip().lower() for o in raw_occasion if isinstance(o, str)]
        elif isinstance(raw_occasion, str):
            occasion = [o.strip().lower() for o in raw_occasion.split(',') if o.strip()]
        else:
            occasion = []
        # ----------------------------------------------

        # Basic validations
        if not name or not image_url or not category:
            return Response(
                {'error': 'Product name, image, and category type are required'},
                status=400
            )

        # Structure document payload to match your database schema perfectly
        doc = {
            'id': str(uuid.uuid4()), 
            'name': name,
            'category': category,      # Saved as lowercase (e.g. "tshirt")
            'gender': gender,          # Saved as abbreviation (e.g. "M")
            'size': size,              # Saved as Array (e.g. ["L"])
            'material': material,      # Saved as lowercase (e.g. "cotton")
            'occasion': occasion,      # Saved as Array (e.g. ["casual"])
            'image_url': image_url,
            'price': float(price) if price else 0.0,
            'created_by': request.user.id, 
            'created_at': datetime.now(timezone.utc)
        }

        # Insert directly into your global MongoDB catalog collection
        result = clothing_col.insert_one(doc)
        doc['_id'] = result.inserted_id

        return Response(serialize_clothing_item(doc), status=201)
    
    def delete(self, request):
        # Expect the product ID to be passed as a query parameter: ?id=XYZ
        product_id = request.query_params.get('id')
        
        if not product_id:
            return Response({'error': 'Product ID is required'}, status=400)
            
        # Delete from your MongoDB collection
        result = clothing_col.delete_one({'id': product_id})
        
        if result.deleted_count == 0:
            # Fallback check for MongoDB's native _id if necessary
            from bson import ObjectId
            try:
                result = clothing_col.delete_one({'_id': ObjectId(product_id)})
            except:
                pass

        if result.deleted_count > 0:
            return Response({'message': 'Product deleted successfully'}, status=200)
        
        return Response({'error': 'Product not found'}, status=404)