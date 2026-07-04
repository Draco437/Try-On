from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    BodyUploadView,
    PreferenceView,
    RecommendationView,
    ClothingItemView,
    TryOnStartView,
    TryOnStatusView,
    WardrobeView,
)

urlpatterns = [
    path('auth/register/', RegisterView.as_view()),

    path('auth/login/',    LoginView.as_view()),

    path('auth/logout/',   LogoutView.as_view()),

    path('body/upload/',   BodyUploadView.as_view()),

    path('preferences/',   PreferenceView.as_view()),

    path('recommend/',     RecommendationView.as_view()),

    path('clothing/<str:item_id>/', ClothingItemView.as_view()),

    path('tryon/start/',   TryOnStartView.as_view()),

    path('tryon/status/<str:job_id>/', TryOnStatusView.as_view()),

    path('wardrobe/',      WardrobeView.as_view()),
]