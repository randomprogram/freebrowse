import os
import json
import mimetypes
import logging
import uuid
import base64
import fnmatch
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Configure logging.  Possible logging levels are:
#   - logging.DEBUG
#   - logging.INFO
#   - logging.WARNING
#   - logging.ERROR
#   - logging.CRITICAL
logging.basicConfig(level=logging.INFO,
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

static_dir = os.getenv('NIIVUE_BUILD_DIR')
data_dir = os.getenv('DATA_DIR')
scene_schema_id = os.getenv('SCENE_SCHEMA_ID')
imaging_extensions_str = os.getenv('IMAGING_EXTENSIONS', '["*.nii", "*.nii.gz"]')
imaging_extensions = json.loads(imaging_extensions_str)
serverless_mode = os.getenv('SERVERLESS_MODE', 'false').lower() == 'true'
logout_url = os.getenv('LOGOUT_URL', '').strip() or None

logger.info(f"NIIVUE_BUILD_DIR: {static_dir}")
logger.info(f"DATA_DIR: {data_dir}")
logger.info(f"SCENE_SCHEMA_ID: {scene_schema_id}")
logger.info(f"IMAGING_EXTENSIONS: {imaging_extensions}")
logger.info(f"SERVERLESS_MODE: {serverless_mode}")
logger.info(f"LOGOUT_URL: {logout_url}")

# Register the MIME type so that .gz files (or .nii.gz files) are served correctly.
mimetypes.add_type("application/gzip", ".nii.gz", strict=True)

class SaveSceneRequest(BaseModel):
    filename: str
    data: dict

class SaveVolumeRequest(BaseModel):
    filename: str
    data: str  # base64 encoded NIfTI data

app = FastAPI()

def _safe_directory_listing(base_dir: str, patterns: List[str], requested_path: str = ""):
    """Return directory contents constrained to base_dir."""
    base_path = Path(base_dir).resolve()
    normalized_request = Path(requested_path or ".").as_posix().strip("/")
    if normalized_request in ("", "."):
        normalized_request = ""

    target_path = (base_path / normalized_request).resolve()

    # Prevent directory traversal outside of base_dir
    if not str(target_path).startswith(str(base_path)):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target_path.exists() or not target_path.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found")

    directories = []
    files = []

    for entry in sorted(target_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        rel_path = entry.relative_to(base_path).as_posix()
        if entry.is_dir():
            directories.append({
                "name": entry.name,
                "path": rel_path,
            })
        elif entry.is_file():
            matches_pattern = (not patterns)
            if not matches_pattern:
                matches_pattern = any(fnmatch.fnmatch(entry.name, pattern) for pattern in patterns)
            if matches_pattern:
                files.append({
                    "filename": rel_path,
                    "url": "data/" + rel_path,
                })

    return {
        "currentPath": normalized_request,
        "directories": directories,
        "files": files,
    }

# Define API routes BEFORE static file mounts to prevent catch-all behavior
@app.get("/config")
def get_config():
    """Return application configuration."""
    return {
        "serverless": serverless_mode,
        "logout_url": logout_url,
    }

@app.get("/nvd")
def list_niivue_documents(path: str = ""):
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    nvd_dir = os.path.join(data_dir)
    logger.debug(f"Listing niivue documents (.nvd) within {nvd_dir} at path '{path}'")
    try:
        return _safe_directory_listing(nvd_dir, ['*.nvd'], path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing niivue documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to list niivue documents")

@app.get("/imaging")
def list_imaging_files(path: str = ""):
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    imaging_dir = os.path.join(data_dir)
    logger.debug(f"Listing imaging files {imaging_extensions} within {imaging_dir} at path '{path}'")
    try:
        return _safe_directory_listing(imaging_dir, imaging_extensions, path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing imaging files: {e}")
        raise HTTPException(status_code=500, detail="Failed to list imaging files")

@app.post("/nvd")
def save_scene(request: SaveSceneRequest):
    """
    Save scene data to a file in the DATA_DIR directory.

    Args:
        request: Contains filename and scene data

    Returns:
        Success message or error
    """
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    try:
        # Validate filename
        if not request.filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        
        # Ensure filename ends with .nvd
        if not request.filename.endswith('.nvd'):
            filename = request.filename + '.nvd'
        else:
            filename = request.filename
        
        # Create full file path
        file_path = Path(data_dir) / filename
        
        # Create directory if it doesn't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write the JSON data to file
        with open(file_path, 'w') as f:
            json.dump(request.data, f, indent=2)
        
        logger.info(f"Scene saved successfully to {file_path}")
        
        return {
            "success": True,
            "message": f"Scene saved successfully to {filename}",
            "file_path": str(file_path.relative_to(data_dir))
        }
        
    except Exception as e:
        logger.error(f"Error saving scene: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save scene: {str(e)}")

@app.post("/nii")
def save_volume(request: SaveVolumeRequest):
    """
    Save volume data to a file in the DATA_DIR directory.

    Args:
        request: Contains filename and base64 encoded NIfTI data

    Returns:
        Success message or error
    """
    if serverless_mode:
        raise HTTPException(status_code=404, detail="Endpoint not available in serverless mode")
    try:
        # Validate filename
        if not request.filename:
            raise HTTPException(status_code=400, detail="Filename is required")
        
        # Remove 'data/' prefix if present (frontend URLs vs backend paths)
        filename = request.filename
        if filename.startswith('data/'):
            filename = filename[5:]  # Remove 'data/' prefix
        
        # Ensure filename has .nii or .nii.gz extension
        if not filename.endswith('.nii') and not filename.endswith('.nii.gz'):
            filename = filename + '.nii.gz'  # Default to compressed
        
        # Decode base64 data
        try:
            volume_data = base64.b64decode(request.data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid base64 data: {str(e)}")
        
        # Create full file path
        file_path = Path(data_dir) / filename
        
        # Create directory if it doesn't exist
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write the binary data to file
        with open(file_path, 'wb') as f:
            f.write(volume_data)
        
        logger.info(f"Volume saved successfully to {file_path}")
        
        return {
            "success": True,
            "message": f"Volume saved successfully to {filename}",
            "file_path": str(file_path.relative_to(data_dir))
        }
        
    except Exception as e:
        logger.error(f"Error saving volume: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save volume: {str(e)}")

# Mount static directories AFTER all API routes
app.mount("/static", StaticFiles(directory=static_dir, html=True), name="static")

# Only mount data directory if not in serverless mode
if not serverless_mode:
    app.mount("/data", StaticFiles(directory=data_dir, html=False), name="data")
