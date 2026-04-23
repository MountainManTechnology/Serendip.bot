"""Local image embedding helper using CLIP (transformers).

This module provides a best-effort local CLIP-based embedder. It's optional
and will raise ImportError if required runtime dependencies are not
installed. To enable in local dev/CI, install the optional dependencies:

- `pip install "[dev,image]"` or add `transformers`, `torch`, `Pillow` to
  your environment.
"""
from __future__ import annotations

from typing import List

_MODEL = None
_PROCESSOR = None


def _load_model():
    global _MODEL, _PROCESSOR
    if _MODEL is not None and _PROCESSOR is not None:
        return _MODEL, _PROCESSOR

    try:
        from transformers import CLIPProcessor, CLIPModel
    except Exception as exc:  # pragma: no cover - optional deps
        raise

    # Load on CPU by default
    _MODEL = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    _MODEL.eval()
    _PROCESSOR = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    return _MODEL, _PROCESSOR


def embed_image_local(image_bytes: bytes) -> List[float]:
    """Return an embedding vector (list[float]) for the provided image bytes.

    Raises ImportError if required libraries are not installed.
    """
    import io
    from PIL import Image
    import torch

    model, processor = _load_model()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        outputs = model.get_image_features(**inputs)
    vec = outputs[0].cpu().numpy().tolist()
    return vec
