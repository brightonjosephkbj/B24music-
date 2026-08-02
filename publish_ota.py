"""
publish_ota.py
Exports the app bundle via Expo, uploads it to the Nrighton233j/Ota-updates
dataset repo on HF in the exact layout updates.py's /manifest endpoint
expects, and updates the latest.json pointer for the current runtime
version. Requires HF_TOKEN env var (write access to Nrighton233j namespace).
"""

import os
import json
import time
import hashlib
import base64
import mimetypes
import subprocess
from pathlib import Path
from huggingface_hub import HfApi
import time as _time

DATASET_REPO = "Nrighton233j/Ota-updates"
EXPORT_DIR = "dist_ota"
PLATFORM = "android"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_file_b64url(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return base64.urlsafe_b64encode(h.digest()).decode("utf-8").rstrip("=")


def get_runtime_version():
    with open("app.json") as f:
        cfg = json.load(f)
    return cfg["expo"]["version"]


def load_expo_export_metadata(export_dir):
    meta_path = os.path.join(export_dir, "metadata.json")
    if not os.path.exists(meta_path):
        raise RuntimeError(
            f"{meta_path} not found - expo export may have failed or "
            "changed its output format."
        )
    with open(meta_path) as f:
        return json.load(f)




def upload_with_retry(api, path_or_fileobj, path_in_repo, repo_id, repo_type, max_attempts=5):
    """Wraps api.upload_file with our own retry loop, since some
    huggingface_hub/httpx version combos close the client after a
    connection error and then crash on the library's own internal retry."""
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            return api.upload_file(
                path_or_fileobj=path_or_fileobj,
                path_in_repo=path_in_repo,
                repo_id=repo_id,
                repo_type=repo_type,
            )
        except Exception as e:
            last_err = e
            wait = min(2 ** attempt, 30)
            print(f"Upload attempt {attempt}/{max_attempts} failed: {e}. Retrying in {wait}s...")
            _time.sleep(wait)
    raise RuntimeError(f"Upload failed after {max_attempts} attempts: {last_err}")


def main():
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN env var not set")

    print("Exporting Expo bundle...")
    subprocess.run(
        ["npx", "expo", "export", "--platform", PLATFORM, "--output-dir", EXPORT_DIR, "--no-bytecode"],
        check=True,
    )

    expo_meta = load_expo_export_metadata(EXPORT_DIR)
    platform_meta = expo_meta.get("fileMetadata", {}).get(PLATFORM)
    if not platform_meta:
        raise RuntimeError(
            f"No '{PLATFORM}' entry in dist_ota/metadata.json fileMetadata. "
            f"Keys found: {list(expo_meta.get('fileMetadata', {}).keys())}"
        )

    runtime_version = get_runtime_version()
    timestamp = str(int(time.time() * 1000))
    remote_prefix = f"updates/{runtime_version}/{timestamp}"

    api = HfApi(token=token)

    bundle_rel_path = platform_meta["bundle"]
    bundle_local_path = os.path.join(EXPORT_DIR, bundle_rel_path)
    bundle_hash = sha256_file(bundle_local_path)
    bundle_hash_b64url = sha256_file_b64url(bundle_local_path)
    bundle_ext = Path(bundle_rel_path).suffix or ".js"
    bundle_filename = f"{PLATFORM}-{bundle_hash}{bundle_ext}"
    bundle_remote_path = f"{remote_prefix}/bundles/{bundle_filename}"

    print(f"Uploading bundle {bundle_rel_path} -> {bundle_remote_path}")
    upload_with_retry(api, bundle_local_path, bundle_remote_path, DATASET_REPO, "dataset")

    assets_manifest = []
    for asset_entry in platform_meta.get("assets", []):
        asset_rel_path = asset_entry["path"]
        asset_ext = asset_entry.get("ext", "")
        asset_local_path = os.path.join(EXPORT_DIR, asset_rel_path)
        asset_hash = sha256_file(asset_local_path)
        asset_hash_b64url = sha256_file_b64url(asset_local_path)
        asset_filename = f"{asset_hash}.{asset_ext}" if asset_ext else asset_hash
        asset_remote_path = f"{remote_prefix}/assets/{asset_filename}"

        content_type = mimetypes.guess_type(f"a.{asset_ext}")[0] or "application/octet-stream"

        print(f"Uploading asset {asset_rel_path} -> {asset_remote_path}")
        upload_with_retry(api, asset_local_path, asset_remote_path, DATASET_REPO, "dataset")

        assets_manifest.append({
            "hash": asset_hash_b64url,
            "key": asset_hash,
            "filename": asset_filename,
            "contentType": content_type,
            "fileExtension": f".{asset_ext}" if asset_ext else "",
        })

    metadata = {
        "runtimeVersion": runtime_version,
        "timestamp": timestamp,
        "bundles": {
            PLATFORM: {
                "hash": bundle_hash_b64url,
                "key": bundle_hash,
                "filename": bundle_filename,
            }
        },
        "assets": assets_manifest,
    }
    metadata_local_path = os.path.join(EXPORT_DIR, "_ota_metadata.json")
    with open(metadata_local_path, "w") as f:
        json.dump(metadata, f)
    upload_with_retry(api, metadata_local_path, f"{remote_prefix}/metadata.json", DATASET_REPO, "dataset")

    latest = {"timestamp": timestamp}
    latest_local_path = os.path.join(EXPORT_DIR, "_ota_latest.json")
    with open(latest_local_path, "w") as f:
        json.dump(latest, f)
    upload_with_retry(api, latest_local_path, f"updates/{runtime_version}/latest.json", DATASET_REPO, "dataset")

    print(f"Published update for runtimeVersion={runtime_version}, timestamp={timestamp}")


if __name__ == "__main__":
    main()
