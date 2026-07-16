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
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access':  str(refresh.access_token),
    }


# ── HELPER: Upload file to S3 ─────────────────────────────────
def upload_to_s3(file_obj, folder='uploads'):
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
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        email    = request.data.get('email', '').strip()
        password = request.data.get('password', '')

        if not username or not email or not password:
            return Response({'error': 'Username, email and password are required'}, status=400)

        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already taken'}, status=400)

        if User.objects.filter(email=email).exists():
            return Response({'error': 'Email already registered'}, status=400)

        user = User.objects.create_user(username=username, email=email, password=password)
        tokens = get_tokens_for_user(user)

        return Response({
            'user':   serialize_user(user),
            'tokens': tokens,
        }, status=201)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '')
        password = request.data.get('password', '')
        user = authenticate(username=username, password=password)

        if not user:
            return Response({'error': 'Invalid username or password'}, status=401)

        tokens = get_tokens_for_user(user)
        return Response({
            'user':   serialize_user(user),
            'tokens': tokens,
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            pass
        return Response({'message': 'Logged out successfully'})


# ═══════════════════════════════════════════════════════════════
# BODY UPLOAD VIEWS
# ═══════════════════════════════════════════════════════════════

class BodyUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        required = ['front', 'back', 'side']
        for view in required:
            if view not in request.FILES:
                return Response({'error': f'Missing image: {view}'}, status=400)

        try:
            bucket = os.getenv('AWS_STORAGE_BUCKET')
            access_key = os.getenv('AWS_ACCESS_KEY_ID')
            
            if not bucket or not access_key:
                fs = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'uploads'), base_url='/media/uploads/')
                front_file = request.FILES['front']
                back_file = request.FILES['back']
                side_file = request.FILES['side']
                
                front_name = fs.save(front_file.name, front_file)
                back_name = fs.save(back_file.name, back_file)
                side_name = fs.save(side_file.name, side_file)
                
                BACKEND_URL = os.getenv('BACKEND_URL', 'http://127.0.0.1:8000')
                front_url = f"{BACKEND_URL}{fs.url(front_name)}"
                back_url = f"{BACKEND_URL}{fs.url(back_name)}"
                side_url = f"{BACKEND_URL}{fs.url(side_name)}"
            else:
                front_url = upload_to_s3(request.FILES['front'], 'body')
                back_url  = upload_to_s3(request.FILES['back'],  'body')
                side_url  = upload_to_s3(request.FILES['side'],  'body')
        except Exception as e:
            return Response({'error': f'File storage processing failed: {str(e)}'}, status=500)

        doc = {
            'user_id':     request.user.id,
            'front_url':   front_url,
            'back_url':    back_url,
            'side_url':    side_url,
            'uploaded_at': datetime.now(timezone.utc),
        }
        result = body_uploads_col.insert_one(doc)
        doc['_id'] = result.inserted_id

        return Response(serialize_body_upload(doc), status=201)

    def get(self, request):
        doc = body_uploads_col.find_one({'user_id': request.user.id}, sort=[('uploaded_at', -1)])
        if not doc:
            return Response({'error': 'No upload found'}, status=404)
        return Response(serialize_body_upload(doc))


# ═══════════════════════════════════════════════════════════════
# PREFERENCE VIEWS (QUIZ PREFERENCES)
# ═══════════════════════════════════════════════════════════════

class PreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_gender   = request.data.get('gender')
        raw_clothing = request.data.get('clothing')
        raw_size     = request.data.get('size')
        raw_material = request.data.get('material', '')
        color        = request.data.get('color', '').strip()
        raw_occasion = request.data.get('occasion', '')

        if not raw_gender or not raw_clothing or not raw_size:
            return Response({'error': 'Gender, clothing and size are required'}, status=400)

        # ── NORMALIZE BEFORE SAVING TO MONGO ──
        if str(raw_gender).strip() in ['Male', 'M', 'm']:
            gender = 'M'
        elif str(raw_gender).strip() in ['Female', 'F', 'f']:
            gender = 'F'
        else:
            gender = str(raw_gender).strip()

        clothing = str(raw_clothing).strip().lower()
        size     = str(raw_size).strip().upper()
        material = str(raw_material).strip().lower() if raw_material else ''
        occasion = str(raw_occasion).strip().lower() if raw_occasion else ''

        # ── Delete old preference if exists ──
        preferences_col.delete_one({'user_id': request.user.id})

        # ── Save normalized preference ──
        doc = {
            'user_id':  request.user.id,
            'gender':   gender,      # Always stored as "M" or "F"
            'clothing': clothing,    # Always stored lowercase (e.g. "tshirt")
            'size':     size,        # Always stored uppercase (e.g. "L")
            'material': material,    # Always stored lowercase (e.g. "cotton")
            'color':    color,
            'occasion': occasion,    # Always stored lowercase (e.g. "casual")
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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pref = preferences_col.find_one({'user_id': request.user.id})

        if not pref:
            return Response({'error': 'Please complete the quiz first'}, status=400)

        # ── 1. PRIMARY FILTER: Always filter by Category and Gender ──
        raw_clothing = pref.get('clothing', '')
        category_query = raw_clothing.strip().lower() if raw_clothing else ''

        raw_gender = pref.get('gender', '')
        if raw_gender in ['Male', 'M', 'm']:
            gender_query = 'M'
        elif raw_gender in ['Female', 'F', 'f']:
            gender_query = 'F'
        else:
            gender_query = raw_gender

        query = {
            'category': category_query,
            'gender':   gender_query,
        }

        # Fetch base matches based on category + gender
        items = list(clothing_col.find(query))

        # ── 2. SECONDARY FILTER: Refine in-memory by Size ──
        if items and pref.get('size'):
            raw_size = pref.get('size')
            normalized_size = raw_size.strip().upper() if isinstance(raw_size, str) else raw_size
            
            # Loop through found items and check if user's size exists in the product's size array
            size_filtered_items = [
                item for item in items 
                if isinstance(item.get('size'), list) and normalized_size in item.get('size')
            ]
            
            # If matching sizes are found, use them! Otherwise, fall back to the base items
            if size_filtered_items:
                items = size_filtered_items

        # ── 3. SAFETY FALLBACKS: Never return an empty list ──
        # If no items matched category + gender, fall back to just category
        if not items:
            items = list(clothing_col.find({'category': category_query}))

        # Absolute fallback: if still nothing, return all clothing items
        if not items:
            items = list(clothing_col.find({}))

        return Response(serialize_list(items, serialize_clothing_item))


class ClothingItemView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, item_id):
        from bson import ObjectId
        doc = clothing_col.find_one({
            '$or': [{'_id': str(item_id)}, {'id': str(item_id)}]
        })
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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from bson import ObjectId

        body_upload_id   = request.data.get('body_upload_id')
        clothing_item_id = request.data.get('clothing_item_id')

        if not body_upload_id or not clothing_item_id:
            return Response({'error': 'body_upload_id and clothing_item_id required'}, status=400)

        try:
            body = body_uploads_col.find_one({
                '_id':     ObjectId(body_upload_id),
                'user_id': request.user.id,
            })
        except Exception:
            return Response({'error': 'Invalid body_upload_id'}, status=400)

        if not body:
            return Response({'error': 'Body upload not found'}, status=404)

        clothing = clothing_col.find_one({
            '$or': [{'_id': str(clothing_item_id)}, {'id': str(clothing_item_id)}]
        })
        if not clothing:
            try:
                if isinstance(clothing_item_id, str) and len(clothing_item_id) == 24 and all(c in '0123456789abcdefABCDEF' for c in clothing_item_id):
                    clothing = clothing_col.find_one({'_id': ObjectId(clothing_item_id)})
            except Exception:
                pass

        if not clothing:
            return Response({'error': f'Clothing item {clothing_item_id} not found'}, status=404)

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
            'created_at':        datetime.now(timezone.utc),
        }
        result = tryon_jobs_col.insert_one(job)
        job_id = str(result.inserted_id)

        run_tryon_pipeline.delay(job_id)
        return Response({'job_id': job_id}, status=201)


class TryOnStatusView(APIView):
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


class WardrobeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        jobs = list(tryon_jobs_col.find({
            'user_id': request.user.id,
            'status':  'done',
        }).sort('created_at', -1).limit(20))
        return Response(serialize_list(jobs, serialize_tryon_job))


# ═══════════════════════════════════════════════════════════════
# PRODUCT MANAGEMENT VIEWS
# ═══════════════════════════════════════════════════════════════

class ProductCreateListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = list(clothing_col.find({}))
        return Response(serialize_list(items, serialize_clothing_item), status=200)

    def post(self, request):
        name = request.data.get('name', '').strip()
        image_url = request.data.get('image', '').strip() 
        price = request.data.get('price', 0)
        
        raw_gender = request.data.get('gender', '')
        if raw_gender in ['Male', 'M', 'm']:
            gender = 'M'
        elif raw_gender in ['Female', 'F', 'f']:
            gender = 'F'
        else:
            gender = raw_gender

        raw_category = request.data.get('clothing', '')
        category = raw_category.strip().lower() if raw_category else ''

        raw_material = request.data.get('material', '')
        material = raw_material.strip().lower() if raw_material else ''

        raw_size = request.data.get('size')
        if isinstance(raw_size, list):
            size = [s.strip().upper() for s in raw_size if isinstance(s, str)]
        elif isinstance(raw_size, str):
            size = [raw_size.strip().upper()]
        else:
            size = []

        raw_occasion = request.data.get('occasion', '')
        if isinstance(raw_occasion, list):
            occasion = [o.strip().lower() for o in raw_occasion if isinstance(o, str)]
        elif isinstance(raw_occasion, str):
            occasion = [o.strip().lower() for o in raw_occasion.split(',') if o.strip()]
        else:
            occasion = []

        if not name or not image_url or not category:
            return Response({'error': 'Product name, image, and category type are required'}, status=400)

        doc = {
            'id': str(uuid.uuid4()), 
            'name': name,
            'category': category,
            'gender': gender,
            'size': size,
            'material': material,
            'occasion': occasion,
            'image_url': image_url,
            'price': float(price) if price else 0.0,
            'created_by': request.user.id, 
            'created_at': datetime.now(timezone.utc)
        }

        result = clothing_col.insert_one(doc)
        doc['_id'] = result.inserted_id

        return Response(serialize_clothing_item(doc), status=201)
    
    def delete(self, request):
        product_id = request.query_params.get('id')
        if not product_id:
            return Response({'error': 'Product ID is required'}, status=400)
            
        result = clothing_col.delete_one({'id': product_id})
        if result.deleted_count == 0:
            from bson import ObjectId
            try:
                result = clothing_col.delete_one({'_id': ObjectId(product_id)})
            except:
                pass

        if result.deleted_count > 0:
            return Response({'message': 'Product deleted successfully'}, status=200)
        return Response({'error': 'Product not found'}, status=404)