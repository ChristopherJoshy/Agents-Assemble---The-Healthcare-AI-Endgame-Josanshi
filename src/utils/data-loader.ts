import { readFile } from "node:fs/promises";
import path from "node:path";

export const readJsonData = async <T>(relativePath: string): Promise<T> => {
  const filePath = path.join(process.cwd(), relativePath);
  return JSON.parse(await readFile(filePath, "utf8")) as T;
};
