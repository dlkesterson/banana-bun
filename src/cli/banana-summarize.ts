#!/usr/bin/env bun

/**
 * Banana Bun CLI tool for generating content summaries
 *
 * Usage:
 *   bun run src/cli/banana-summarize.ts --media 123
 *   bun run src/cli/banana-summarize.ts --media 123 --style bullet --model gpt-4
 *   bun run src/cli/banana-summarize.ts --media 123 --force
 */

import { parseArgs } from "util";
import { initDatabase, getDatabase } from "../db";
import { logger } from "../utils/logger";
import { createMediaSummarizeTask } from "../executors/summarize";
import { summarizerService } from "../services/summarizer";

interface CliOptions {
  mediaId?: number;
  style?: "bullet" | "paragraph" | "key_points";
  model?: string;
  force?: boolean;
  direct?: boolean; // Run directly without creating a task
  help?: boolean;
}

function printUsage() {
  console.log(`
Banana Bun Content Summarization Tool

Usage: bun run src/cli/banana-summarize.ts [options]

Options:
  --media <id>              Media ID to summarize (required)
  --style <style>           Summary style: bullet, paragraph, key_points (default: bullet)
  --model <model>           LLM model to use (default: gpt-3.5-turbo)
  --force                   Force regeneration even if summary exists
  --direct                  Run summarization directly instead of creating a task
  --help, -h                Show this help message

Examples:
  bun run src/cli/banana-summarize.ts --media 123
  bun run src/cli/banana-summarize.ts --media 123 --style paragraph
  bun run src/cli/banana-summarize.ts --media 123 --model gpt-4 --force
  bun run src/cli/banana-summarize.ts --media 123 --direct

Styles:
  bullet      - Bullet-point summary (default)
  paragraph   - Paragraph format summary
  key_points  - Key points extraction
`);
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      media: { type: "string" },
      style: { type: "string" },
      model: { type: "string" },
      force: { type: "boolean", default: false },
      direct: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const options: CliOptions = {
    force: values.force,
    direct: values.direct,
    help: values.help,
  };

  if (values.media) {
    const mediaId = parseInt(values.media, 10);
    if (isNaN(mediaId)) {
      throw new Error(`Invalid media ID: ${values.media}`);
    }
    options.mediaId = mediaId;
  }

  if (values.style) {
    if (!["bullet", "paragraph", "key_points"].includes(values.style)) {
      throw new Error(
        `Invalid style: ${values.style}. Must be one of: bullet, paragraph, key_points`
      );
    }
    options.style = values.style as "bullet" | "paragraph" | "key_points";
  }

  if (values.model) {
    options.model = values.model;
  }

  return options;
}

async function validateMediaExists(
  mediaId: number
): Promise<{ exists: boolean; hasTranscript: boolean; filePath?: string }> {
  const db = getDatabase();

  // Check if media exists
  const mediaRow = db
    .prepare(
      `
        SELECT mm.file_path, mt.id as transcript_id, mt.transcript_text
        FROM media_metadata mm
        LEFT JOIN media_transcripts mt ON mm.id = mt.media_id
        WHERE mm.id = ?
    `
    )
    .get(mediaId) as
    | { file_path: string; transcript_id?: number; transcript_text?: string }
    | undefined;

  if (!mediaRow) {
    return { exists: false, hasTranscript: false };
  }

  return {
    exists: true,
    hasTranscript: !!mediaRow.transcript_id && !!mediaRow.transcript_text,
    filePath: mediaRow.file_path,
  };
}

async function runDirectSummarization(options: CliOptions): Promise<void> {
  if (!options.mediaId) {
    throw new Error("Media ID is required");
  }

  console.log(`🧠 Generating summary for media ID ${options.mediaId}...`);
  console.log(`📝 Style: ${options.style || "bullet"}`);
  console.log(`🤖 Model: ${options.model || "gpt-3.5-turbo"}`);
  console.log(`💪 Force: ${options.force ? "Yes" : "No"}\n`);

  const result = await summarizerService.generateSummaryForMedia(
    options.mediaId,
    {
      style: options.style || "bullet",
      model: options.model,
    }
  );

  if (!result.success) {
    console.error(`❌ Summarization failed: ${result.error}`);
    process.exit(1);
  }

  console.log("✅ Summary generated successfully!\n");
  console.log("📄 Summary:");
  console.log("=".repeat(50));
  console.log(result.summary);
  console.log("=".repeat(50));

  if (result.tokens_used) {
    console.log(`\n📊 Tokens used: ${result.tokens_used}`);
  }
  if (result.processing_time_ms) {
    console.log(`⏱️  Processing time: ${result.processing_time_ms}ms`);
  }
  if (result.model_used) {
    console.log(`🤖 Model used: ${result.model_used}`);
  }
}

async function createSummarizationTask(options: CliOptions): Promise<void> {
  if (!options.mediaId) {
    throw new Error("Media ID is required");
  }

  console.log(
    `📋 Creating summarization task for media ID ${options.mediaId}...`
  );

  const taskId = await createMediaSummarizeTask(options.mediaId, {
    style: options.style,
    model: options.model,
    force: options.force,
  });

  console.log(`✅ Summarization task created successfully!`);
  console.log(`📋 Task ID: ${taskId}`);
  console.log(`\n🚀 The task will be processed by the orchestrator.`);
  console.log(`   Start the system with: bun run dev`);
  console.log(`   Or check the dashboard for progress.`);
}

async function main() {
  try {
    const options = parseCliArgs();

    if (options.help) {
      printUsage();
      process.exit(0);
    }

    if (!options.mediaId) {
      console.error("❌ Media ID is required");
      printUsage();
      process.exit(1);
    }

    console.log("🍌 Banana Bun Content Summarization Tool");
    console.log("===================================\n");

    // Initialize database
    await initDatabase();
    console.log("✅ Database initialized");

    // Validate media exists and has transcript
    const validation = await validateMediaExists(options.mediaId);

    if (!validation.exists) {
      console.error(`❌ Media with ID ${options.mediaId} not found`);
      process.exit(1);
    }

    if (!validation.hasTranscript) {
      console.error(`❌ Media with ID ${options.mediaId} has no transcript`);
      console.log(
        "💡 Tip: Run transcription first with: bun run src/cli/smart-transcribe.ts"
      );
      process.exit(1);
    }

    console.log(`📁 Media file: ${validation.filePath}`);
    console.log(`✅ Transcript available\n`);

    // Check if summarizer service is available
    if (!summarizerService.isInitialized()) {
      console.error("❌ Summarizer service not initialized");
      console.log("💡 Tip: Set OPENAI_API_KEY environment variable");
      process.exit(1);
    }

    if (options.direct) {
      await runDirectSummarization(options);
    } else {
      await createSummarizationTask(options);
    }
  } catch (error) {
    console.error(
      "❌ Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
