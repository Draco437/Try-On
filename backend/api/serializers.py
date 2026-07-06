from datetime import datetime

# ── HELPER ────────────────────────────────────────────────────
def serialize_id(doc):
    """
    MongoDB uses ObjectId for _id field
    ObjectId is not JSON serializable
    This converts it to a plain string

    Example:
    ObjectId('64abc123def456') → '64abc123def456'
    """
    if doc and '_id' in doc:
        doc['id'] = str(doc['_id'])   # create new 'id' field as string
        del doc['_id']                # remove original '_id' field
    return doc


def serialize_datetime(value):
    """
    Python datetime objects are not JSON serializable
    This converts them to ISO format strings

    Example:
    datetime(2025, 7, 3, 10, 30) → '2025-07-03T10:30:00'
    """
    if isinstance(value, datetime):
        return value.isoformat()
    return value


# ── BODY UPLOAD SERIALIZER ────────────────────────────────────
def serialize_body_upload(doc):
    """
    Converts a body_uploads MongoDB document → JSON

    Input (from MongoDB):
    {
        '_id': ObjectId('...'),
        'user_id': 1,
        'front_url': 'https://s3...',
        'back_url': 'https://s3...',
        'side_url': 'https://s3...',
        'uploaded_at': datetime(...)
    }

    Output (for React):
    {
        'id': '64abc123...',
        'user_id': 1,
        'front_url': 'https://s3...',
        'back_url': 'https://s3...',
        'side_url': 'https://s3...',
        'uploaded_at': '2025-07-03T10:30:00'
    }
    """
    if not doc:
        return None

    return {
        'id':          str(doc['_id']),
        'user_id':     doc.get('user_id'),
        'front_url':   doc.get('front_url', ''),
        'back_url':    doc.get('back_url', ''),
        'side_url':    doc.get('side_url', ''),
        'uploaded_at': serialize_datetime(doc.get('uploaded_at')),
    }


# ── USER PREFERENCE SERIALIZER ────────────────────────────────
def serialize_preference(doc):
    """
    Converts a preferences MongoDB document → JSON

    Input (from MongoDB):
    {
        '_id': ObjectId('...'),
        'user_id': 1,
        'gender': 'M',
        'clothing': 'tshirt',
        'size': 'L',
        'material': 'cotton',
        'color': 'blue',
        'occasion': 'casual'
    }

    Output (for React):
    {
        'id': '64abc123...',
        'user_id': 1,
        'gender': 'M',
        'clothing': 'tshirt',
        'size': 'L',
        'material': 'cotton',
        'color': 'blue',
        'occasion': 'casual'
    }
    """
    if not doc:
        return None

    return {
        'id':       str(doc['_id']),
        'user_id':  doc.get('user_id'),
        'gender':   doc.get('gender', ''),
        'clothing': doc.get('clothing', ''),
        'size':     doc.get('size', ''),
        'material': doc.get('material', ''),
        'color':    doc.get('color', ''),
        'occasion': doc.get('occasion', ''),
    }


# ── CLOTHING ITEM SERIALIZER ──────────────────────────────────
def serialize_clothing_item(doc):
    """
    Converts a clothing_items MongoDB document → JSON

    Input (from MongoDB):
    {
        '_id': ObjectId('...'),
        'name': 'Blue Cotton T-Shirt',
        'category': 'tshirt',
        'material': 'cotton',
        'color': 'blue',
        'size': 'L',
        'gender': 'M',
        'occasion': 'casual',
        'image_url': 'https://s3...',
        'price': 599.00
    }

    Output (for React):
    {
        'id': '64abc123...',
        'name': 'Blue Cotton T-Shirt',
        ... same fields ...
    }
    """
    if not doc:
        return None

    return {
        'id':        str(doc['_id']),
        'name':      doc.get('name', ''),
        'category':  doc.get('category', ''),
        'material':  doc.get('material', ''),
        'color':     doc.get('color', ''),
        'size':      doc.get('size', ''),
        'gender':    doc.get('gender', ''),
        'occasion':  doc.get('occasion', ''),
        'image_url': doc.get('image_url', ''),
        'price':     doc.get('price', 0),
    }


# ── TRYON JOB SERIALIZER ──────────────────────────────────────
def serialize_tryon_job(doc):
    """
    Converts a tryon_jobs MongoDB document → JSON

    Status can be:
    'pending'    → job created, ML not started yet
    'processing' → ML pipeline is running
    'done'       → results ready, show to user
    'failed'     → something went wrong

    Input (from MongoDB):
    {
        '_id': ObjectId('...'),
        'user_id': 1,
        'body_upload_id': '64abc...',
        'clothing_item_id': '64xyz...',
        'status': 'done',
        'front_result': 'https://s3...',
        'back_result': 'https://s3...',
        'side_result': 'https://s3...',
        'style_score': 8.4,
        'style_feedback': 'Fits well at shoulders...',
        'created_at': datetime(...)
    }
    """
    if not doc:
        return None

    return {
        'id':                str(doc['_id']),
        'user_id':           doc.get('user_id'),
        'body_upload_id':    doc.get('body_upload_id', ''),
        'clothing_item_id':  doc.get('clothing_item_id', ''),
        'status':            doc.get('status', 'pending'),
        'front_result':      doc.get('front_result', None),
        'back_result':       doc.get('back_result', None),
        'side_result':       doc.get('side_result', None),
        'style_score':       doc.get('style_score', None),
        'style_feedback':    doc.get('style_feedback', None),
        'created_at':        serialize_datetime(doc.get('created_at')),
    }


# ── USER SERIALIZER ───────────────────────────────────────────
def serialize_user(user):
    """
    Converts Django User object → JSON
    Used after login and register

    Input: Django User object
    Output:
    {
        'id': 1,
        'username': 'john',
        'email': 'john@example.com',
        'date_joined': '2025-07-03T10:30:00'
    }
    """
    if not user:
        return None

    return {
        'id':          user.id,
        'username':    user.username,
        'email':       user.email,
        'date_joined': serialize_datetime(user.date_joined),
    }


# ── LIST SERIALIZER ───────────────────────────────────────────
def serialize_list(docs, serializer_fn):
    """
    Applies a serializer to a list of documents

    Usage:
    serialize_list(clothing_items, serialize_clothing_item)
    → returns a list of serialized dicts

    Instead of writing:
    [serialize_clothing_item(doc) for doc in docs]
    You write:
    serialize_list(docs, serialize_clothing_item)
    """
    return [serializer_fn(doc) for doc in docs]