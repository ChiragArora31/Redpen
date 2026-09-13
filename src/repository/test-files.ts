const TEST_PATTERNS = [
  /(^|\/)tests?\//i,
  /(^|\/)__tests__\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|\/)test_[^/]+\.py$/i,
  /_test\.py$/i,
];

export function isTestFile(path: string): boolean {
  return TEST_PATTERNS.some((pattern) => pattern.test(path));
}
