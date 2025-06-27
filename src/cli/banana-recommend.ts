#!/usr/bin/env bun

/**
 * Banana Bun CLI tool for generating content recommendations
 *
 * Usage:
 *   bun run src/cli/banana-recommend.ts --media 123
 *   bun run src/cli/banana-recommend.ts --user alice --top 10
 *   bun run src/cli/banana-recommend.ts --user alice --media 123 --type hybrid
 */

import { parseArgs } from "util";
import { initDatabase, getDatabase } from "../db";
import { logger } from "../utils/logger";
import {
  createMediaRecommendTask,
  recordUserInteraction,
} from "../executors/recommend";
import { recommenderService } from "../services/recommender";

interface CliOptions {
  mediaId?: number;
  userId?: string;
  type?: "similar" | "user_based" | "hybrid";
  top?: number;
  direct?: boolean; // Run directly without creating a task
  record?: string; // Record user interaction: play, like, share, etc.
  help?: boolean;
}

function printUsage() {
  console.log(`
Banana Bun Content Recommendation Tool

Usage: bun run src/cli/banana-recommend.ts [options]

Options:
  --media <id>              Media ID for similar recommendations
  --user <id>               User ID for personalized recommendations
  --type <type>             Recommendation type: similar, user_based, hybrid (default: similar if media provided, user_based if user provided)
  --top <number>            Number of recommendations to return (default: 5)
  --direct                  Run recommendations directly instead of creating a task
  --record <action>         Record user interaction (play, like, share, complete, skip)
  --help, -h                Show this help message

Examples:
  # Get similar media recommendations
  bun run src/cli/banana-recommend.ts --media 123

  # Get personalized recommendations for user
  bun run src/cli/banana-recommend.ts --user alice --top 10

  # Get hybrid recommendations
  bun run src/cli/banana-recommend.ts --user alice --media 123 --type hybrid

  # Record user interaction
  bun run src/cli/banana-recommend.ts --user alice --media 123 --record play

  # Run directly without creating a task
  bun run src/cli/banana-recommend.ts --media 123 --direct

Recommendation Types:
  similar      - Find media similar to the specified media ID
  user_based   - Find media based on user's interaction history
  hybrid       - Combine similar and user-based recommendations
`);
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      media: { type: "string" },
      user: { type: "string" },
      type: { type: "string" },
      top: { type: "string" },
      direct: { type: "boolean", default: false },
      record: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const options: CliOptions = {
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

  if (values.user) {
    options.userId = values.user;
  }

  if (values.type) {
    if (!["similar", "user_based", "hybrid"].includes(values.type)) {
      throw new Error(
        `Invalid recommendation type: ${values.type}. Must be one of: similar, user_based, hybrid`
      );
    }
    options.type = values.type as "similar" | "user_based" | "hybrid";
  }

  if (values.top) {
    const top = parseInt(values.top, 10);
    if (isNaN(top) || top < 1 || top > 50) {
      throw new Error(
        `Invalid top value: ${values.top}. Must be between 1 and 50`
      );
    }
    options.top = top;
  }

  if (values.record) {
    const validActions = [
      "play",
      "like",
      "share",
      "complete",
      "skip",
      "search_click",
    ];
    if (!validActions.includes(values.record)) {
      throw new Error(
        `Invalid action: ${values.record}. Must be one of: ${validActions.join(
          ", "
        )}`
      );
    }
    options.record = values.record;
  }

  return options;
}

async function validateInputs(
  options: CliOptions
): Promise<{ valid: boolean; error?: string }> {
  const db = getDatabase();

  // Determine recommendation type if not specified
  if (!options.type) {
    if (options.mediaId && options.userId) {
      options.type = "hybrid";
    } else if (options.mediaId) {
      options.type = "similar";
    } else if (options.userId) {
      options.type = "user_based";
    } else {
      return {
        valid: false,
        error: "Either --media or --user must be specified",
      };
    }
  }

  // Validate required parameters for each type
  if (options.type === "similar" && !options.mediaId) {
    return {
      valid: false,
      error: "Media ID is required for similar recommendations",
    };
  }

  if (
    (options.type === "user_based" || options.type === "hybrid") &&
    !options.userId
  ) {
    return {
      valid: false,
      error: "User ID is required for user-based and hybrid recommendations",
    };
  }

  // Validate media exists if provided
  if (options.mediaId) {
    const mediaRow = db
      .prepare("SELECT id FROM media_metadata WHERE id = ?")
      .get(options.mediaId);
    if (!mediaRow) {
      return {
        valid: false,
        error: `Media with ID ${options.mediaId} not found`,
      };
    }
  }

  return { valid: true };
}

async function recordInteraction(options: CliOptions): Promise<void> {
  if (!options.record || !options.userId || !options.mediaId) {
    return;
  }

  console.log(
    `📝 Recording ${options.record} interaction for user ${options.userId} on media ${options.mediaId}...`
  );

  await recordUserInteraction(options.userId, options.mediaId, options.record);

  console.log("✅ Interaction recorded successfully");
}

async function runDirectRecommendations(options: CliOptions): Promise<void> {
  console.log(`🎯 Generating ${options.type} recommendations...`);
  console.log(`📊 Type: ${options.type}`);
  console.log(`🔢 Count: ${options.top || 5}`);
  if (options.mediaId) console.log(`🎬 Media ID: ${options.mediaId}`);
  if (options.userId) console.log(`👤 User ID: ${options.userId}`);
  console.log();

  let result;

  switch (options.type) {
    case "similar":
      result = await recommenderService.findSimilarMedia(options.mediaId!, {
        topK: options.top || 5,
        includeReason: true,
        excludeWatched: true,
        userId: options.userId,
      });
      break;

    case "user_based":
      result = await recommenderService.getUserRecommendations(
        options.userId!,
        {
          topK: options.top || 10,
          includeReason: true,
        }
      );
      break;

    case "hybrid":
      // For hybrid, we'll create a task since it's more complex
      console.log(
        "⚠️  Hybrid recommendations require task creation. Use --direct=false or omit --direct flag."
      );
      return;

    default:
      throw new Error(`Unsupported recommendation type: ${options.type}`);
  }

  if (!result.success) {
    console.error(`❌ Recommendation generation failed: ${result.error}`);
    process.exit(1);
  }

  console.log("✅ Recommendations generated successfully!\n");
  console.log("🎯 Recommendations:");
  console.log("=".repeat(60));

  if (!result.recommendations || result.recommendations.length === 0) {
    console.log("No recommendations found.");
  } else {
    result.recommendations.forEach((rec, index) => {
      console.log(
        `${index + 1}. ${rec.metadata?.filename || `Media ID ${rec.media_id}`}`
      );
      console.log(`   Score: ${Math.round(rec.score * 100)}%`);
      if (rec.reason) {
        console.log(`   Reason: ${rec.reason}`);
      }
      if (rec.metadata?.duration) {
        console.log(
          `   Duration: ${Math.round(rec.metadata.duration / 60)}m ${Math.round(
            rec.metadata.duration % 60
          )}s`
        );
      }
      if (rec.metadata?.format) {
        console.log(`   Format: ${rec.metadata.format}`);
      }
      console.log();
    });
  }

  console.log("=".repeat(60));
  console.log(`📈 Algorithm: ${result.algorithm_used}`);
  console.log(`🔍 Candidates evaluated: ${result.total_candidates || "N/A"}`);
}

async function createRecommendationTask(options: CliOptions): Promise<void> {
  console.log(`📋 Creating ${options.type} recommendation task...`);

  const taskId = await createMediaRecommendTask({
    mediaId: options.mediaId,
    userId: options.userId,
    recommendationType: options.type!,
    topK: options.top || 5,
  });

  console.log(`✅ Recommendation task created successfully!`);
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

    console.log("🍌 Banana Bun Content Recommendation Tool");
    console.log("====================================\n");

    // Initialize database
    await initDatabase();
    console.log("✅ Database initialized");

    // Validate inputs
    const validation = await validateInputs(options);
    if (!validation.valid) {
      console.error(`❌ ${validation.error}`);
      printUsage();
      process.exit(1);
    }

    // Check if recommender service is available
    if (!recommenderService.isInitialized()) {
      console.error("❌ Recommender service not initialized");
      process.exit(1);
    }

    console.log(`✅ Validation passed\n`);

    // Record interaction if requested
    if (options.record) {
      await recordInteraction(options);
      console.log();
    }

    // Generate recommendations
    if (options.direct) {
      await runDirectRecommendations(options);
    } else {
      await createRecommendationTask(options);
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
