"""
publish_ota.py
Builds the app bundle, uploads it to the Nrighton233j/Ota-updates dataset
repo on HF, and updates the latest.json pointer for the current runtime
version. Requires HF_TOKEN env var (write access to Nrighton233j namespace).
"""

import os
import json
import time
import hashlib
import subprocess
from huggingface_hub import HfApi

DATASET_REPO = "Nrighton233j/Ota-updates"
EXPORT_DIR = "dist_ota"

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def get_runtime_version():
    with open("app.json") as f:
        cfg = json.load(f)
    return cfg["expo"]["version"]

def main():
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN env var not set")

    print("Exporting Expo bundle...")
    subprocess.run(
        ["npx", "expo", "export", "--platform", "android", "--output-dir", EXPORT_DIR],
        check=True,
    )

    runtime_version = get_runtime_version()
    timestamp = str(int(time.time() * 1000))
    remote_prefix = f"updates/{runtime_version}/{timestamp}"

    api = HfApi(token=token)
    assets_manifest = []

    for root, _, files in os.walk(EXPORT_DIR):
        for fname in files:
            local_path = os.path.join(root, fname)
            rel_path = os.path.relpath(local_path, EXPORT_DIR)
            file_hash = sha256_file(local_path)
            remote_path = f"{remote_prefix}/{rel_path}"

            print(f"Uploading {rel_path} -> {remote_path}")
            api.upload_file(
                path_or_fileobj=local_path,
                path_in_repo=remote_path,
                repo_id=DATASET_REPO,
                repo_type="dataset",
            )
            assets_manifest.append({"path": rel_path, "sha256": file_hash})

    metadata = {
        "runtimeVersion": runtime_version,
        "timestamp": timestamp,
        "assets": assets_manifest,
    }
    metadata_path = os.path.join(EXPORT_DIR, "metadata.json")
    with open(metadata_path, "w") as f:
        json.dump(metadata, f)
    api.upload_file(
        path_or_fileobj=metadata_path,
        path_in_repo=f"{remote_prefix}/metadata.json",
        repo_id=DATASET_REPO,
        repo_type="dataset",
    )

    latest = {"runtimeVersion": runtime_version, "timestamp": timestamp}
    latest_path = "latest.json"
    with open(latest_path, "w") as f:
        json.dump(latest, f)
    api.upload_file(
        path_or_fileobj=latest_path,
        path_in_repo=f"updates/{runtime_version}/latest.json",
        repo_id=DATASET_REPO,
        repo_type="dataset",
    )

    print(f"Published update for runtimeVersion={runtime_version}, timestamp={timestamp}")

if __name__ == "__main__":
    main()
