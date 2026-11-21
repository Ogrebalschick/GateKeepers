# Astra Guard 2.6.0-rc1 — Layer 2 patch

This patch applies the Layer 2 implementation to the uploaded GateKeepers2 project.

## Contents

- Updated `AI-Guard/ml-service` (Layer 2 client, prompt/parser, cascade integration, tests, docs, reports).
- Updated `AI-Guard/docker-compose.yml` with LLM environment variables.
- Added `AI-Guard/docker-compose.llm.yml` for an optional local llama.cpp server.
- Added `AI-Guard/.env.example` and `AI-Guard/models/README.md`.
- Updated root `.env.example`, `.gitignore`, and `tasks-ai.md`.

## Apply

Extract this archive over the root of the current GateKeepers project, preserving the folder structure. Do not copy `.venv`; recreate the Python environment from `requirements.txt`.

Layer 2 remains disabled by default. For live inference, provide a GGUF model and configure `AI-Guard/.env` as described in `AI-Guard/ml-service/README.md`.

The patch does not include a GGUF model, Docker image, `.env`, credentials, `.git`, or `.venv`.
