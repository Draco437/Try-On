import json
import os
from django.core.management.base import BaseCommand
from api.db import clothing_col

class Command(BaseCommand):
    help = 'Sync products.json to MongoDB clothing_items collection'

    def handle(self, *args, **kwargs):
        # Path to products.json in frontend
        json_path = os.path.join(
            os.path.dirname(__file__),
            '..', '..', '..', '..', 
            'frontend', 'src', 'data', 'products.json'
        )
        json_path = os.path.abspath(json_path)

        self.stdout.write(f'Reading: {json_path}')

        if not os.path.exists(json_path):
            self.stdout.write(self.style.ERROR(f'File not found: {json_path}'))
            return

        with open(json_path, 'r') as f:
            products = json.load(f)

        self.stdout.write(f'Found {len(products)} products')

        # Clear existing and re-insert
        clothing_col.delete_many({})
        self.stdout.write('Cleared existing clothing items')

        for product in products:
            # Store with both 'id' and 'image_url' fields
            doc = {
                'id':          product['id'],
                'name':        product['name'],
                'category':    product['category'],
                'gender':      product['gender'],
                'size':        product['size'],
                'material':    product['material'],
                'color':       product['color'],
                'occasion':    product['occasion'],
                'price':       product['price'],
                'rating':      product['rating'],
                'image_url':   product['image'],
                # ↑ stored as image_url so tasks.py finds it
                'description': product.get('description', ''),
            }
            clothing_col.insert_one(doc)
            self.stdout.write(f"  ✅ {product['id']} — {product['name']}")

        self.stdout.write(
            self.style.SUCCESS(f'\n✅ Synced {len(products)} products to MongoDB')
        )