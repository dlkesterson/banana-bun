import { homedir } from "os";
import { join } from "path";

/**
 * Cross-platform path utilities for Banana Bun
 * Provides consistent path handling across Windows, Linux, and macOS
 */

/**
 * Get the user's home directory in a cross-platform way
 * Prefers environment variables for better testability
 */
export function getUserHomeDirectory(): string {
  // Use environment variables first for better cross-platform support and testability
  if (process.platform === "win32") {
    return process.env.USERPROFILE || homedir();
  } else {
    return process.env.HOME || homedir();
  }
}

/**
 * Get a cross-platform default base path for Banana Bun data
 * Uses environment variable if set, otherwise falls back to platform-appropriate defaults
 */
export function getDefaultBasePath(): string {
  if (process.env.BASE_PATH) {
    return process.env.BASE_PATH;
  }

  const home = getUserHomeDirectory();

  switch (process.platform) {
    case "win32":
      // Windows: Use Documents/BananaBun or AppData/Local/BananaBun
      return join(home, "Documents", "BananaBun");
    case "darwin":
      // macOS: Use ~/Library/Application Support/BananaBun
      return join(home, "Library", "Application Support", "BananaBun");
    default:
      // Linux and others: Use ~/.local/share/banana-bun
      return join(home, ".local", "share", "banana-bun");
  }
}

/**
 * Get a cross-platform default media collection path
 * Uses environment variable if set, otherwise falls back to platform-appropriate defaults
 */
export function getDefaultMediaPath(): string {
  if (process.env.MEDIA_COLLECTION_PATH) {
    return process.env.MEDIA_COLLECTION_PATH;
  }

  const home = getUserHomeDirectory();

  switch (process.platform) {
    case "win32":
      // Windows: Use Documents/Media or a dedicated drive if available
      return join(home, "Documents", "Media");
    case "darwin":
      // macOS: Use ~/Movies (standard macOS media directory)
      return join(home, "Movies");
    default:
      // Linux: Use ~/Media or ~/Videos
      return join(home, "Media");
  }
}

/**
 * Get platform-appropriate temporary directory for fallbacks
 */
export function getTempDirectory(): string {
  switch (process.platform) {
    case "win32":
      return process.env.TEMP || process.env.TMP || "C:\\temp";
    default:
      return "/tmp";
  }
}

/**
 * Get cross-platform default paths for specific media types
 */
export function getDefaultMediaTypePaths() {
  const mediaBase = getDefaultMediaPath();

  return {
    tv: process.env.MEDIA_COLLECTION_TV || join(mediaBase, "TV Shows"),
    movies: process.env.MEDIA_COLLECTION_MOVIES || join(mediaBase, "Movies"),
    youtube: process.env.MEDIA_COLLECTION_YOUTUBE || join(mediaBase, "YouTube"),
    catchall:
      process.env.MEDIA_COLLECTION_CATCHALL || join(mediaBase, "Downloads"),
  };
}

/**
 * Get cross-platform default S3 sync paths
 */
export function getDefaultS3Paths() {
  const home = getUserHomeDirectory();
  const baseData = getDefaultBasePath();

  return {
    downloadPath:
      process.env.S3_DEFAULT_DOWNLOAD_PATH || join(home, "s3-downloads"),
    syncLogPath:
      process.env.S3_SYNC_LOG_PATH || join(baseData, "logs", "s3_sync"),
  };
}

/**
 * Ensure a path uses forward slashes (for consistency in config)
 * Windows can handle forward slashes in most cases
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Create all the standard Banana Bun directory structure
 */
export function getStandardDirectoryStructure(basePath: string) {
  return {
    incoming: join(basePath, "incoming"),
    processing: join(basePath, "processing"),
    archive: join(basePath, "archive"),
    error: join(basePath, "error"),
    tasks: join(basePath, "tasks"),
    outputs: join(basePath, "outputs"),
    logs: join(basePath, "logs"),
    dashboard: join(basePath, "dashboard"),
    media: join(basePath, "media"),
    database: join(basePath, "tasks.sqlite"),
  };
}

/**
 * Resolve environment variables in paths (cross-platform)
 * Handles both Unix-style ($HOME, ${HOME}) and Windows-style (%USERPROFILE%)
 */
export function resolveEnvironmentVariables(path: string): string {
  // Handle Windows-style environment variables (%VAR%)
  path = path.replace(/%([^%]+)%/g, (match, varName) => {
    return process.env[varName] || match;
  });

  // Handle Unix-style environment variables ($VAR and ${VAR})
  path = path.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] || match;
  });

  path = path.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
    return process.env[varName] || match;
  });

  return path;
}

/**
 * Get platform-specific executable extension
 */
export function getExecutableExtension(): string {
  return process.platform === "win32" ? ".exe" : "";
}

/**
 * Find executable in PATH with platform-specific handling
 */
export function findExecutable(name: string): string {
  const extension = getExecutableExtension();
  const executableName = name.endsWith(extension) ? name : name + extension;

  // For most cases, just return the name and let the system find it in PATH
  return executableName;
}

/**
 * Validate that a path is safe and doesn't contain dangerous patterns
 */
export function validatePath(path: string): boolean {
  // Basic validation - no null bytes, no parent directory traversal beyond reasonable limits
  if (path.includes("\0")) return false;
  if (path.includes("..\\..\\..\\..\\")) return false; // Excessive parent traversal
  if (path.includes("../../../../")) return false; // Excessive parent traversal

  return true;
}

/**
 * Create a cross-platform configuration object with all paths resolved
 */
export function createCrossPlatformConfig() {
  const basePath = getDefaultBasePath();
  const mediaPath = getDefaultMediaPath();
  const mediaTypePaths = getDefaultMediaTypePaths();
  const s3Paths = getDefaultS3Paths();
  const standardDirs = getStandardDirectoryStructure(basePath);

  return {
    basePath,
    mediaPath,
    mediaTypePaths,
    s3Paths,
    standardDirs,
    platform: process.platform,
    isWindows: process.platform === "win32",
    isLinux: process.platform === "linux",
    isMacOS: process.platform === "darwin",
  };
}
