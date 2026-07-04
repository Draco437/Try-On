import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'main.settings')
# ↑ Tells Celery which Django settings to use
# Without this Celery doesn't know about our database, apps etc

app = Celery('main')
# ↑ Creates the Celery application named 'main'

app.config_from_object('django.conf:settings', namespace='CELERY')
# ↑ Reads all CELERY_* settings from settings.py automatically
# So CELERY_BROKER_URL, CELERY_RESULT_BACKEND etc are picked up

app.autodiscover_tasks()
# ↑ Automatically finds tasks.py in every installed app
# So api/tasks.py is discovered without manual registration