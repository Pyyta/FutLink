export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== '23505') {
    return false;
  }
  return constraint === undefined || candidate.constraint === constraint;
}
