---
id: bulk-folder-rename-task
type: batch
description: Scan directory and rename all folders with AI
generator:
    type: folder_rename
    directory_path: 'E:\Downloads (temp area)'
    recursive: false
metadata:
    created_by: 'user'
    priority: 2
    tags: ['file-management', 'cleanup', 'ai-rename', 'bulk-operation']
    markdown_content: |
        # Bulk Folder Rename Task

        This task will scan a specified directory and automatically create individual
        rename tasks for each folder found, using AI to generate clean, properly 
        formatted folder names.

        ## Target Directory
        - Path: `E:\Downloads (temp area)`
        - Recursive: false (only immediate subdirectories)
        - Will create one rename_item task per folder

        ## Process Flow
        1. Scan the target directory for folders
        2. Create individual rename_item tasks for each folder
        3. Each rename task uses Ollama AI to clean folder names
        4. Parent task tracks completion of all subtasks

        ## AI Cleaning Rules
        Each generated rename_item task will use Ollama to clean folder names by:
        - Using proper capitalization and spacing
        - Removing technical details (codecs, resolution, release groups)
        - Keeping meaningful content (show names, seasons, episodes)
        - Following standard naming conventions
        - Preserving important metadata while removing clutter

        ## Expected Results
        - All folders will have clean, readable names
        - No more messy download folder names with random characters
        - Organized, professional-looking directory structure
        - Each folder rename tracked as individual subtask

        ## Safety Features
        - Checks that source folders exist before renaming
        - Prevents overwriting existing folders
        - Each subtask reports detailed old/new name info
        - Parent task aggregates all rename results
---

This task template creates a bulk renaming operation that:

1. **Scans** the specified directory for folders
2. **Generates** individual rename_item tasks for each folder
3. **Uses AI** to suggest clean, professional folder names
4. **Tracks** all subtask completion in the parent task

Perfect for organizing downloaded content directories where folders often have
terrible names with technical details, release groups, and random characters.

## Example Directory Transformation

Before:

```
E:\Downloads (temp area)\
├── Pinky.and.the.Brain.S02.1080p.UPSCALED.DD.5.1.x265-EDGE2020\
├── [2024]_Important_Docs_v2.1.FINAL.backup\
├── IMG_BATCH_20240101_MESS_001\
└── Movie.Title.2024.2160p.UHD.BluRay.x265-GROUP\
```

After:

```
E:\Downloads (temp area)\
├── Pinky and the Brain S02\
├── Important Docs 2024\
├── IMG Batch 2024 January\
└── Movie Title 2024\
```

Each folder rename is handled as a separate subtask, allowing for:

-   Individual error handling
-   Progress tracking per folder
-   Detailed rename reporting
-   Easy retry of failed renames
