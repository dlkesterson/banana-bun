---
id: llm-text-generation-demo
type: llm
description: "Generate creative content using local LLM"
context: "Write a short, creative story about a banana that becomes sentient and starts organizing files on a computer. The story should be fun, whimsical, and relate to file management themes. Keep it under 200 words."
model: "qwen2.5:7b"
temperature: 0.8
max_tokens: 300
metadata:
  priority: "normal"
  tags: ["basic", "llm", "creative", "text-generation"]
  created_by: "example"
  notes: "Demonstrates LLM task for creative text generation. Uses higher temperature for creativity. Shows how to use context for specific prompts."
---

# LLM Text Generation Example

This task demonstrates how to use the LLM executor to generate creative content using a local language model.

## Key Features Demonstrated:
- **Context-based prompting**: Specific instructions for the AI
- **Model selection**: Choosing appropriate model (qwen2.5:7b)
- **Temperature control**: Higher temperature (0.8) for creativity
- **Token limits**: Controlling output length
- **Thematic content**: Story relates to file management (Banana Bun's purpose)

## Expected Output:
The LLM will generate a creative short story about a sentient banana organizing files, demonstrating the system's ability to produce contextual, themed content.

## Use Cases:
- Content creation for documentation
- Creative writing assistance
- Generating examples and explanations
- Automated content for reports or summaries
