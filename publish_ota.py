"""
publish_ota.py — publishes a JS-bundle-only OTA update for B24music.

Runs `expo export`, zips the output, and POSTs it to the B24-ota-v2
server's /admin/upload-ota endpoint (through the gateway) - the server
handles uploading bundle+assets to the Nrighton233j/B24-ota-v2 dataset
repo itself and registers the update in its database.

Requires:
  OTA_ADMIN_KEY env var - must match the ADMIN_KEY secret set on the
  B24-ota-v2 Space, sent as the X-Admin-Key header.

Usage:
  OTA_ADMIN_KEY=yourkey python publish_ota.py
  OTA_ADMIN_KEY=yourkey python publish_ota.py --notes "Fixed player next/prev"
"""

import os
import sys
import json
import zipfile
import argparse
import subprocess
from pathlib import Path

import requests

APP_ID = "b24music"
EXPORT_DIR = "dist_ota"
PLATFORM = "android"
API_BASE = os.environ.get("OTA_API_BASE", "https://gateway-cah4.onrender.com/api/ota")
GATEWAY_KEY = os.environ.get("OTA_GATEWAY_KEY", "Joy_brightonjosephkbj_Joan")


def get_runtime_version():
    with open("app.json") as f:
        cfg = json.load(f)
    # Matches app.json's runtimeVersion policy ("appVersion") - the OTA
    # server keys updates by this same value, so it must always be the
    # app's version string, not something separately tracked.
    return cfg["expo"]["version"]


def run_expo_export():
    print(f"Exporting Expo bundle to {EXPORT_DIR}/ ...")
    subprocess.run(
        ["npx", "expo", "export", "--platform", PLATFORM, "--output-dir", EXPORT_DIR, "--no-bytecode"],
        check=True,
    )
    meta_path = os.path.join(EXPORT_DIR, "metadata.json")
    if not os.path.exists(meta_path):
        raise RuntimeError(f"{meta_path} not found - expo export may have failed.")


def zip_export_dir(export_dir):
    zip_path = "ota_upload.zip"
    if os.path.exists(zip_path):
        os.remove(zip_path)
    print(f"Zipping {export_dir}/ -> {zip_path} ...")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(export_dir):
            for filename in files:
                filepath = os.path.join(root, filename)
                arcname = os.path.relpath(filepath, export_dir)
                zf.write(filepath, arcname)
    return zip_path


def publish(zip_path, runtime_version, notes, admin_key):
    url = f"{API_BASE}/admin/upload-ota"
    print(f"Publishing runtime_version={runtime_version} to {url} ...")
    with open(zip_path, "rb") as f:
        resp = requests.post(
            url,
            headers={"X-Admin-Key": admin_key, "X-Gateway-Key": GATEWAY_KEY},
            data={"app_id": APP_ID, "runtime_version": runtime_version, "notes": notes or ""},
            files={"file": (zip_path, f, "application/zip")},
            timeout=300,
        )
    if resp.status_code != 200:
        raise RuntimeError(f"Publish failed ({resp.status_code}): {resp.text}")
    return resp.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--notes", default=None, help="Release notes shown to the app")
    parser.add_argument("--skip-export", action="store_true", help=f"Reuse existing {EXPORT_DIR}/ instead of re-running expo export")
    args = parser.parse_args()

    admin_key = os.environ.get("OTA_ADMIN_KEY", "85ZRiyI8Dc0NUp-pspdYJMQ6bPrDWhff")
    if not admin_key:
        print("ERROR: OTA_ADMIN_KEY env var not set (must match the ADMIN_KEY secret on the B24-ota-v2 Space)")
        sys.exit(1)

    if not args.skip_export:
        run_expo_export()

    runtime_version = get_runtime_version()
    zip_path = zip_export_dir(EXPORT_DIR)

    result = publish(zip_path, runtime_version, args.notes, admin_key)

    print(f"Published: update_id={result['update_id']}, runtime_version={result['runtime_version']}, "
          f"assets={result['asset_count']}")

    os.remove(zip_path)


if __name__ == "__main__":
    main()
