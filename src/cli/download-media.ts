#!/usr/bin/env bun

/**
 * CLI tool for downloading media content
 *
 * Usage:
 *   bun run src/cli/download-media.ts --source youtube --url https://youtube.com/watch?v=...
 *   bun run src/cli/download-media.ts --source torrent --query "Movie Title 2024" --media movie
 *   bun run src/cli/download-media.ts --source rss --url https://feeds.example.com/podcast.xml
 */

import { initDatabase, getDatabase } from "../db";
import { config } from "../config";
import { logger } from "../utils/logger";
import type { MediaDownloadTask } from "../types/task";

interface CliOptions {
  source: "torrent" | "nzb" | "youtube" | "rss";
  url?: string;
  query?: string;
  media?: "movie" | "tv" | "music" | "video";
  dest?: string;
  quality?: string;
  format?: string;
  help?: boolean;
  simulate?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--simulate") {
      options.simulate = true;
    } else if (arg.startsWith("--source=")) {
      const source = arg.split("=")[1] as CliOptions["source"];
      if (["torrent", "nzb", "youtube", "rss"].includes(source)) {
        options.source = source;
      } else {
        throw new Error(
          `Invalid source: ${source}. Must be one of: torrent, nzb, youtube, rss`
        );
      }
    } else if (arg.startsWith("--url=")) {
      options.url = arg.split("=")[1];
    } else if (arg.startsWith("--query=")) {
      options.query = arg.split("=")[1];
    } else if (arg.startsWith("--media=")) {
      const media = arg.split("=")[1] as CliOptions["media"];
      if (["movie", "tv", "music", "video"].includes(media)) {
        options.media = media;
      } else {
        throw new Error(
          `Invalid media type: ${media}. Must be one of: movie, tv, music, video`
        );
      }
    } else if (arg.startsWith("--dest=")) {
      options.dest = arg.split("=")[1];
    } else if (arg.startsWith("--quality=")) {
      options.quality = arg.split("=")[1];
    } else if (arg.startsWith("--format=")) {
      options.format = arg.split("=")[1];
    }
  }

  // Validate required fields
  if (!options.source) {
    throw new Error("Source is required. Use --source=<source>");
  }

  if (
    (options.source === "youtube" || options.source === "rss") &&
    !options.url
  ) {
    throw new Error(`${options.source} source requires --url parameter`);
  }

  if (
    (options.source === "torrent" || options.source === "nzb") &&
    !options.query
  ) {
    throw new Error(`${options.source} source requires --query parameter`);
  }

  return options as CliOptions;
}

function printHelp() {
  console.log(`
Media Download CLI Tool

Usage:
  bun run src/cli/download-media.ts --source <source> [options]

Required Arguments:
  --source <source>        Download source (youtube, torrent, nzb, rss)

Options:
  --url <url>              URL for YouTube or RSS downloads
  --query <query>          Search query for torrent/NZB downloads
  --media <type>           Media type (movie, tv, music, video)
  --dest <path>            Destination directory
  --quality <quality>      Video quality preference
  --format <format>        Video format preference
  --simulate               Simulate download without actually downloading
  --help, -h               Show this help message

Examples:
  # Download YouTube video
  bun run src/cli/download-media.ts --source youtube --url "https://youtube.com/watch?v=dQw4w9WgXcQ"
  
  # Download from RSS feed
  bun run src/cli/download-media.ts --source rss --url "https://feeds.example.com/podcast.xml"

Configuration:
  YouTube downloads use yt-dlp: ${config.downloaders.ytdlp.path}
  Default output directory: ${config.paths.media}
`);
}

async function createMediaDownloadTask(options: CliOptions): Promise<number> {
  const { source, url, query, media, dest, quality, format, simulate } =
    options;

  // Create task description
  let description = `Download media from ${source}`;
  if (url) description += `: ${url}`;
  if (query) description += `: ${query}`;
  if (simulate) description += " (SIMULATION)";

  const taskArgs = {
    source,
    url,
    query,
    media_type: media,
    destination_path: dest,
    quality,
    format,
  };

  const db = getDatabase();
  const result = db.run(
    `INSERT INTO tasks (type, description, status, args)
         VALUES (?, ?, ?, ?)`,
    [
      "media_download",
      description,
      simulate ? "completed" : "pending", // Mark simulation tasks as completed
      JSON.stringify(taskArgs),
    ]
  );

  const taskId = result.lastInsertRowid as number;

  await logger.info("Media download task created", {
    taskId,
    source,
    url,
    query,
    mediaType: media,
    simulate,
  });

  return taskId;
}

function validateConfiguration(source: CliOptions["source"]): void {
  switch (source) {
    case "youtube":
      // Check if yt-dlp is available
      // In a real implementation, you might want to test the command
      break;
    case "torrent":
      throw new Error("Torrent downloads are not supported in Banana Bun");
      break;
    case "nzb":
      throw new Error("NZB downloads are not yet implemented");
    case "rss":
      if (!config.downloaders.rss.enabled) {
        console.warn("⚠️  RSS downloads are not enabled in configuration");
      }
      break;
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.help) {
      printHelp();
      process.exit(0);
    }

    console.log("📥 Media Download CLI Tool");
    console.log("==========================\n");

    // Initialize database
    await initDatabase();
    console.log("✅ Database initialized");

    // Validate configuration
    validateConfiguration(options.source);
    console.log("✅ Configuration validated");

    // Create task
    console.log(`📡 Source: ${options.source}`);
    if (options.url) console.log(`🔗 URL: ${options.url}`);
    if (options.query) console.log(`🔍 Query: ${options.query}`);
    if (options.media) console.log(`🎬 Media Type: ${options.media}`);
    if (options.dest) console.log(`📁 Destination: ${options.dest}`);
    if (options.simulate) console.log("🧪 Mode: SIMULATION");
    console.log();

    const taskId = await createMediaDownloadTask(options);

    console.log(`✅ Media download task created successfully!`);
    console.log(`📋 Task ID: ${taskId}`);

    if (options.simulate) {
      console.log(
        `\n🧪 This was a simulation - no actual download was performed.`
      );
    } else {
      console.log(`\n🚀 The task will be processed by the orchestrator.`);
      console.log(`   Start the system with: bun run dev`);
      console.log(`   Or check the dashboard for progress.`);
    }
  } catch (error) {
    console.error(
      "❌ Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}
