import { defangUrl } from "../utils/url";

test("should return defanged url", () => {
  expect(defangUrl("google.com")).toEqual("google(dot)com");
});

test("should return the same url if not fanged", () => {
  expect(defangUrl("googlecom")).toEqual("googlecom");
});
