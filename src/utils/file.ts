import path from "node:path";
import { globSync } from "glob";

/**
 * Utilizes globSync to find files in a directory.
 *
 * @param globPath A sequence of paths or path segments. The function will automatically append a trailing slash '/' if it's missing.
 * @param fileExtension The file extension to filter by. Defaults to "*.ts" if not provided.
 * @returns An object containing the filtered file paths as an array.
 * @throws {TypeError} if any of the arguments is not a string.
 */
export function readDirectory(
  globPath: string,
  fileExtension: string = "*.ts"
) {
  if (globPath[-1] != "/") {
    globPath += "/";
  }

  let filteredFiles = globSync(globPath + fileExtension);

  return { filteredFiles: filteredFiles.map((file) => path.resolve(file)) };
}
