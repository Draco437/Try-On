#!/bin/bash
set -e

# ── FIX: Explicitly enter the backend directory ──
cd "$(dirname "$0")"

# Now running management commands will find manage.py perfectly
python manage.py sync_products

# Celery runs in the background
celery -A main worker --loglevel=info --concurrency=1 &

# Gunicorn stays in the foreground
exec gunicorn main.wsgi:application --bind 0.0.0.0:$PORT --workers 2