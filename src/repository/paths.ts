const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".pytest_cache",
  ".redpen",
  ".test-dist",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "venv",
]);

export function isRepositoryEvidencePath(path: string): boolean {
  const segments = path.replaceAll("\\", "/").replace(/^\.\//, "").split("/");
  return segments.every((segment) => !EXCLUDED_DIRECTORY_NAMES.has(segment));
}

export const gitEvidenceIgnorePatterns = [...EXCLUDED_DIRECTORY_NAMES]
  .filter((directory) => directory !== ".git")
  .map((directory) => `${directory}/`)
  .join("\n");
