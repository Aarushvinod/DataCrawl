import firebase_admin
from firebase_admin import credentials, firestore, storage
from app.config import settings

_app = None


def init_firebase():
    global _app
    if _app is not None:
        return

    if settings.FIREBASE_CREDENTIALS_PATH:
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
    else:
        # Falls back to Application Default Credentials
        cred = credentials.ApplicationDefault()

    bucket_name = settings.FIREBASE_STORAGE_BUCKET or f"{settings.FIREBASE_PROJECT_ID}.firebasestorage.app"
    _app = firebase_admin.initialize_app(cred, {
        "storageBucket": bucket_name,
    })


def get_firestore_client():
    init_firebase()
    return firestore.client()


def get_storage_bucket():
    init_firebase()
    return storage.bucket()
