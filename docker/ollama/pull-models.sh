#!/bin/bash
# Pull all required Ollama models after container starts
# Run: docker exec mpg2-ollama bash /pull-models.sh

echo "Pulling llama3.2 (sentiment + narrative analysis)..."
ollama pull llama3.2

echo "Pulling nomic-embed-text (embeddings)..."
ollama pull nomic-embed-text

echo "All models ready."
ollama list
