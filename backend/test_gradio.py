import requests
import tempfile
import os
from gradio_client import Client, handle_file

PERSON_URL  = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=768&h=1024&fit=crop"
GARMENT_URL = "https://images.unsplash.com/photo-1622445275463-afa2ab738c34?w=768&h=1024&fit=crop"

def download_to_temp(url):
    print(f"📥 Downloading: {url}")
    response = requests.get(url, timeout=15)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.jpg')
    tmp.write(response.content)
    tmp.close()
    print(f"✅ Saved to: {tmp.name}")
    return tmp.name

def test_leffa():
    print("\n━━━ Testing franciszzj/Leffa ━━━")
    person_path  = download_to_temp(PERSON_URL)
    garment_path = download_to_temp(GARMENT_URL)

    try:
        client = Client("franciszzj/Leffa")
        print("✅ Connected")
        print("🚀 Running try-on — takes 60-120 seconds...")

        # ── Positional args — no named params ──────────────
        # Order from API docs:
        # 1. src_image_path  (person)
        # 2. ref_image_path  (garment)
        # 3. ref_acceleration (bool)
        # 4. step            (int)
        # 5. scale           (float)
        # 6. seed            (int)
        # 7. vt_model_type   (str)
        # 8. vt_garment_type (str)
        # 9. vt_repaint      (bool)

        result = client.predict(
            handle_file(person_path),   # src_image_path
            handle_file(garment_path),  # ref_image_path
            False,                      # ref_acceleration
            30,                         # step
            2.5,                        # scale
            42,                         # seed
            "viton_hd",                 # vt_model_type
            "upper_body",               # vt_garment_type
            False,                      # vt_repaint
            api_name="/leffa_predict_vt"
        )

        print(f"\n📦 Result type:  {type(result)}")
        print(f"📦 Full result:  {result}")

        if result and isinstance(result, (list, tuple)):
            generated_image = result[0]
            print(f"\n📦 Generated image: {generated_image}")

            if isinstance(generated_image, dict):
                url  = generated_image.get('url')
                path = generated_image.get('path')
                print(f"\n✅ URL:  {url}")
                print(f"✅ Path: {path}")
            else:
                print(f"\n✅ Result: {generated_image}")

        return True

    except Exception as e:
        print(f"❌ Failed: {type(e).__name__}: {e}")
        return False

    finally:
        try:
            os.unlink(person_path)
            os.unlink(garment_path)
        except:
            pass

if __name__ == "__main__":
    test_leffa()