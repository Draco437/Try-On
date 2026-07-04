from .celery import app as celery_app

__all__ = ('celery_app', )

# ↑ Makes Celery start automatically when Django starts
# Without this you'd have to start Celery separately every time