/**
 * @type {import('prettier').Options}
 */
module.exports = {
  printWidth: 90,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: true,
  importOrder: ["^@chainpatrol/(.*)$", "~/(.*)$", "~(.*)$", "^[./]"],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderCaseInsensitive: false,
  plugins: [require.resolve("@trivago/prettier-plugin-sort-imports")],
};
