from django.db import models
# api/models.py

# We use Django's built-in User model for authentication
# All our custom data goes directly into MongoDB via api/db.py
# So no custom Django models needed here

# Django's User model gives us:
# - Username / email / password (hashed)
# - Login / logout
# - JWT token generation
# - /admin panel user management

from django.contrib.auth.models import User

# Re-export so other files can import from here
__all__ = ['User']