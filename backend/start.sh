#!/bin/bash
set -e

python manage.py sync_products

# Celery runs in the background
celery -A main worker --loglevel=info --concurrency=1 &

# Gunicorn stays in the foreground — this is what Render's health check needs bound to $PORT
exec gunicorn main.wsgi:application --bind 0.0.0.0:$PORT --workers 2