from celery import Celery
import os

BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
BACKEND_URL = os.environ.get("CELERY_BACKEND_URL", "redis://localhost:6379/0")

app = Celery(
    'ocr_tasks',
    broker=BROKER_URL,
    backend=BACKEND_URL,
    include=['tasks']
)

app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Kolkata',
    enable_utc=True,
    result_extended=False,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_transport_options={'visibility_timeout': 3600},
)
