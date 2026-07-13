import json
from pathlib import Path

from django.core.management.base import BaseCommand

from api.db import clothing_col


class Command(BaseCommand):
    help = "Seed MongoDB's clothing_items collection from frontend/src/data/products.json"

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            default=None,
            help='Path to products.json (defaults to frontend/src/data/products.json)',
        )

    def handle(self, *args, **options):
        backend_dir = Path(__file__).resolve().parents[3]
        default_path = backend_dir.parent / 'frontend' / 'src' / 'data' / 'products.json'
        products_path = Path(options['file']) if options.get('file') else default_path

        if not products_path.exists():
            self.stderr.write(self.style.ERROR(f'products.json not found at {products_path}'))
            return

        with open(products_path, 'r', encoding='utf-8') as f:
            products = json.load(f)

        inserted, updated = 0, 0

        for product in products:
            product_id = product['id']

            doc = {
                '_id':       product_id,
                'id':        product_id,
                'name':      product.get('name', ''),
                'category':  product.get('category', ''),
                'material':  product.get('material', ''),
                'color':     product.get('color', ''),
                'size':      product.get('size', []),
                'gender':    product.get('gender', ''),
                'occasion':  product.get('occasion', []),
                'image_url': product.get('image', ''),
                'price':     product.get('price', 0),
                'rating':    product.get('rating'),
                'description': product.get('description', ''),
            }

            result = clothing_col.update_one(
                {'_id': product_id},
                {'$set': doc},
                upsert=True,
            )

            if result.upserted_id is not None:
                inserted += 1
            elif result.modified_count:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f'Seeded clothing_items: {inserted} inserted, {updated} updated, '
            f'{len(products)} total products processed from {products_path}'
        ))