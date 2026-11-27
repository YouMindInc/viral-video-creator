# Monorepo integration

This tool is bundled under `tools/sam2`. Run its `.venv/bin/python` from this directory. The HyperFrames app passes absolute input/output paths and uses fresh output directories under `templates/editorial-explainer/.cache/sam2/`.

The script and pinned requirements are copied from the existing local SAM2 project. The Core ML models and local Python environment are also included in this local package, but are ignored by Git. `Setup.command` recreates missing dependencies/models for a fresh checkout. `model-files.sha256.json` records the exact model bytes used for the checked example. The model card declares Apache-2.0; see `models/coreml-sam2-small/README.md` for attribution.

The default input example and sample images are included. The large ProRes output is a generated artifact and is not included; the browser-ready alpha layer is already in the HyperFrames app. Always inspect test frames before a complete run, as described in `AGENT.md`.
