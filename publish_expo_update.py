"""
publish_expo_update.py — publishes a JS-bundle-only Expo Updates OTA update
for B24music, served by api-cache's expoUpdates.py (/api/updates/manifest).

Runs `expo export`, uploads the resulting bundle + assets straight to the
Nrighton233j/B24-ota-v2 HF dataset repo (same repo already used for the
native-APK OTA pipeline), computes each file's sha256 for Expo's manifest
hash format, then registers the update via api-cache's /api/updates/publish.

Requires:
  HF_TOKEN env var - write access token for Nrighton233j/B24-ota-v2
  EXPO_UPDATES_ADMIN_KEY env var - must match the secret set on the
  Api-cache Space (X-Admin-Key header)

Usage:
  HF_TOKEN=... EXPO_UPDATES_ADMIN_KEY=... python publish_expo_update.py
"""

import os
import sys
import json
import base64
import hashlib
import mimetypes
import argparse
import subprocess
from pathlib import Path

import requests
from huggingface_hub import HfApi

APP_ID = "b24music"
EXPORT_DIR = "dist_ota_expo"
PLATFORM = "android"
HF_REPO = "Nrighton233j/B24-ota-v2"
HF_REPO_TYPE = "dataset"
API_BASE = os.environ.get(
    "EXPO_UPDATES_API_BASE",
    "https://nrighton233j-api-cache.hf.space/api/updates",
)


def get_runtime_version():
    with open("app.json") as f:
        cfg = json.load(f)
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
    return meta_path


def sha256_base64url(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    # Raw digest, base64url-encoded, no padding - the format Expo Updates
    # expects for manifest asset hashes.
    return base64.urlsafe_b64encode(h.digest()).decode().rstrip("=")


def guess_content_type(filepath):
    ctype, _ = mimetypes.guess_type(filepath)
    return ctype or "application/octet-stream"


def upload_to_hf(local_path, remote_path, hf_token):
    api = HfApi(token=hf_token)
    api.upload_file(
        path_or_fileobj=local_path,
        path_in_repo=remote_path,
        repo_id=HF_REPO,
        repo_type=HF_REPO_TYPE,
    )
    return f"https://huggingface.co/datasets/{HF_REPO}/resolve/main/{remote_path}"


def build_manifest_assets(export_dir, meta_path, runtime_version, hf_token):
    with open(meta_path) as f:
        meta = json.load(f)

    android_meta = meta["fileMetadata"][PLATFORM]
    bundle_rel = android_meta["bundle"]
    asset_entries = android_meta.get("assets", [])

    def process(rel_path):
        local_path = os.path.join(export_dir, rel_path)
        remote_path = f"expo-updates/{runtime_version}/{rel_path}"
        print(f"  uploading {rel_path} ...")
        url = upload_to_hf(local_path, remote_path, hf_token)
        entry = {
            "hash": sha256_base64url(local_path),
            "key": Path(rel_path).stem,
            "contentType": guess_content_type(local_path),
            "url": url,
        }
        ext = Path(rel_path).suffix
        if ext:
            entry["fileExtension"] = ext
        return entry

    print("Uploading launch asset (JS bundle) ...")
    launch_asset = process(bundle_rel)

    assets = []
    if asset_entries:
        print(f"Uploading {len(asset_entries)} additional asset(s) ...")
        for a in asset_entries:
            rel_path = a["path"] if isinstance(a, dict) else a
            assets.append(process(rel_path))

    return launch_asset, assets


def publish(runtime_version, launch_asset, assets, admin_key):
    url = f"{API_BASE}/publish"
    print(f"Registering update at {url} ...")
    resp = requests.post(
        url,
        headers={"X-Admin-Key": admin_key},
        json={
            "app_id": APP_ID,
            "runtimeVersion": runtime_version,
            "launchAsset": launch_asset,
            "assets": assets,
        },
        timeout=60,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Publish failed ({resp.status_code}): {resp.text}")
    return resp.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-export", action="store_true", help=f"Reuse existing {EXPORT_DIR}/ instead of re-running expo export")
    args = parser.parse_args()

    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        print("ERROR: HF_TOKEN env var not set (write access to Nrighton233j/B24-ota-v2 required)")
        sys.exit(1)

    admin_key = os.environ.get("EXPO_UPDATES_ADMIN_KEY")
    if not admin_key:
        print("ERROR: EXPO_UPDATES_ADMIN_KEY env var not set (must match api-cache's secret)")
        sys.exit(1)

    if not args.skip_export:
        meta_path = run_expo_export()
    else:
        meta_path = os.path.join(EXPORT_DIR, "metadata.json")
        if not os.path.exists(meta_path):
            raise RuntimeError(f"{meta_path} not found - can't skip export without a prior export")

    runtime_version = get_runtime_version()
    launch_asset, assets = build_manifest_assets(EXPORT_DIR, meta_path, runtime_version, hf_token)

    result = publish(runtime_version, launch_asset, assets, admin_key)
    print(f"Published: runtimeVersion={result['entry']['runtimeVersion']}, "
          f"assets={len(result['entry']['assets'])}")


if __name__ == "__main__":
    main()
