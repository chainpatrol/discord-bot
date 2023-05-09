import fs from "node:fs";
import path from "node:path";

/**
 * If paths is a sequence of segments, path.resolve is run
 *
 * If paths is a singular element, path.join is run
 *
 * if paths is empty, __dirname is used
 *
 * @param paths A sequence of paths or path segments.
 * @throws {TypeError} if any of the arguments is not a string.
 */
export function readDirectory(
  fileExtension: string = ".ts",
  ...paths: string[]
) {
  let readPath;
  if (paths.length === 0) {
    readPath = __dirname;
  } else if (paths.length === 1) {
    readPath = path.join(__dirname, paths[0]);
  } else {
    readPath = path.resolve(__dirname, ...paths);
  }

  const filteredFiles = fs
    .readdirSync(readPath)
    .filter((file) => file.endsWith(fileExtension));

  return { readPath, filteredFiles };
}
