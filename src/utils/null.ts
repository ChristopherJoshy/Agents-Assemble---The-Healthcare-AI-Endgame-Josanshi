export const ensure = <T>(value: T | null | undefined, msg = "Expected value to be present"): T => {
  if (value === null || value === undefined) {
    throw new Error(msg);
  }

  return value;
};

export const ensureArray = <T>(arr: T[] | null | undefined): T[] => arr ?? [];

export const firstOr = <T>(arr: T[] | null | undefined, fallback: T): T => arr?.[0] ?? fallback;
