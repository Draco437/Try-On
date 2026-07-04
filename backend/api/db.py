# api/db.py

import pymongo
import os
from dotenv import load_dotenv
# ↑ Loads the .env file into environment variables
# Without this, os.getenv() returns None for everything

load_dotenv()

MONGO_URI     = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
MONGO_DB_NAME = os.getenv('MONGO_DB_NAME', 'fitai_db')

client = pymongo.MongoClient(MONGO_URI)
db     = client[MONGO_DB_NAME]

body_uploads_col = db['body_uploads']
preferences_col  = db['preferences']
clothing_col     = db['clothing_items']
tryon_jobs_col   = db['tryon_jobs']

def test_connection():
    try:
        client.admin.command('ping')
        # ↑ Sends a ping to MongoDB server
        # If MongoDB responds → connection is alive
        # If it throws an error → connection failed
        print('✅ MongoDB connected successfully')
        return True
    except Exception as e:
        print(f'❌ MongoDB connection failed: {e}')
        return False