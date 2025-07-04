---
sidebar_position: 1
---

# CLI Commands

Banana Bun exposes a rich collection of command line tools located in `src/cli/`. These scripts are executed with `bun run <script>` and provide automation around media ingest, tagging, analysis and optimization.

## Core Utilities

- **media-ingest** – import media files into the library
- **media-organize** – reorganize files and generate metadata
- **media-search** – simple search across indexed content
- **smart-search** – semantic search using ChromaDB and MeiliSearch
- **smart-transcribe** – advanced transcription with Whisper
- **media-intelligence** – run cross-modal analytics tasks
- **media-tags** – inspect and modify tags on media entries

## Advanced Analytics

- **banana-summarize** – summarize transcripts or documents
- **banana-recommend** – generate content recommendations
- **banana-detect-scenes** – detect scenes in video
- **banana-detect-objects** – detect objects using TensorFlow
- **banana-audio-analyze** – analyze audio files
- **banana-embed-media** – create CLIP/OpenL3 embeddings
- **banana-search-similar** – find media with similar embeddings

## System Monitoring

- **analyze-task-metrics** – review task execution metrics
- **run-feedback-loop** – process user feedback for learning
- **generate-optimized-plan** – build optimized task plans
- **analyze-system-performance** – summarize overall performance
- **optimize-metadata** – improve metadata quality
- **manage-plan-templates** – list and apply saved plans
- **test-llm-planning** – quick test for the planning service
- **analyze-activity-patterns** – detect usage patterns
- **view-detected-patterns** – display stored patterns
- **generate-scheduling-rules** – create cron rules from patterns
- **optimize-resource-schedule** – load balancing suggestions
- **search-similar-patterns** – find historical pattern matches
- **analyze-feedback-enhanced** – advanced feedback analysis
- **test-tag-strategies** – evaluate tagging strategies
- **analyze-cross-modal-intelligence** – correlate search and tags

Run any command with `--help` to view all flags and options.
