import { checkAsset } from "../commands/check";
import axios from "axios";

jest.mock("axios");

afterEach(() => {
  jest.restoreAllMocks();
});

test("should get ALLOWED for good sites", () => {
  const status = { status: "ALLOWED" };
  const resp = { data: status };

  (axios.post as jest.Mock).mockResolvedValueOnce(resp);

  return checkAsset("google.com").then((data) =>
    expect(data.content).toEqual("✅ This link looks safe! `google(dot)com`")
  );
});

test("should get BLOCKED for bad sites", () => {
  const status = { status: "BLOCKED" };
  const resp = { data: status };

  (axios.post as jest.Mock).mockResolvedValueOnce(resp);

  return checkAsset("hack.com").then((data) =>
    expect(data.content).toEqual(
      "🚨 **Alert** 🚨 \n\nThis link is a scam! `hack(dot)com` \n\n_Please **DO NOT** click on this link._"
    )
  );
});
