---
id: rename-downloads-task
tool: rename_item
args:
    current_path: 'E:\Downloads (temp area)\Pinky.and.the.Brain.S02.1080p.UPSCALED.DD.5.1.x265-EDGE2020'
metadata:
    created_by: 'user'
    priority: 2
    tags: ['file-management', 'cleanup', 'ai-rename']
    markdown_content: |
        # File Rename Task

        This task will use AI to automatically rename all messy files and folders
        in the Downloads temp area with clean, properly formatted names.

        ## Target Directory
        - Path: `E:\Downloads (temp area)\Pinky.and.the.Brain.S02.1080p.UPSCALED.DD.5.1.x265-EDGE2020`
        - Will process all files and subdirectories

        ## AI Cleaning Rules
        The rename_item tool uses Ollama (qwen3:8b model) to clean filenames by:
        - Using proper capitalization
        - Removing unnecessary characters, numbers, or prefixes
        - Replacing spaces with underscores or hyphens
        - Keeping names descriptive but concise
        - Following standard naming conventions
        - Preserving file extensions

        ## Expected Results
        - All files will have clean, readable names
        - Folders will be properly formatted
        - No more messy download filenames with random characters
        - File extensions will be preserved

        ## Safety Features
        - Checks that source files exist before renaming
        - Prevents overwriting existing files
        - Returns detailed info about old and new names
---

This task will batch process all the messy files in your Downloads temp area,
using AI to suggest clean, professional filenames. Perfect for organizing
downloaded content that often comes with terrible default names.

## Example Transformations

-   `[2024] Important Document!!! (1).pdf` → `Important_Document.pdf`
-   `IMG_20240101_MESS_001.jpg` → `Photo_2024_January.jpg`
-   `video-file_DOWNLOADED_123.mp4` → `Video_File.mp4`

The AI will analyze each filename and suggest the most appropriate cleaned version
while preserving the essential meaning and file extension.
