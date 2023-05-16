import { readDirectory } from "../utils/file";
import * as glob from "glob";
import * as path from "path";

afterEach(() => {
  jest.restoreAllMocks();
});

test("should return correct file paths", () => {
  jest
    .spyOn(glob, "globSync")
    .mockReturnValueOnce([
      "./src/commands/file1.ts",
      "./src/commands/file2.ts",
    ]);

  const { filteredFiles } = readDirectory("./test/location");

  const commandPath = path.resolve(__dirname, "..", "commands");

  expect(filteredFiles.length).toEqual(2);

  expect(filteredFiles).toEqual([
    commandPath + "/file1.ts",
    commandPath + "/file2.ts",
  ]);
});

test("should return empty file paths if path invalid or empty folder", () => {
  const logSpy = jest.spyOn(global.console, "warn").mockImplementation();

  jest.spyOn(glob, "globSync").mockReturnValueOnce([]);

  const { filteredFiles } = readDirectory("./test/location/empty");

  expect(console.warn).toHaveBeenCalledWith(
    "No files found in directory ./test/location/empty/"
  );
  expect(filteredFiles).toEqual([]);

  logSpy.mockRestore();
});
