import { describe, expect, it } from "vitest";

import { isForegroundChatWaiting } from "@/hooks/use-sales-engine-chat";

describe("chat wait mode", () => {
  it("blocks input only during foreground pending", () => {
    expect(isForegroundChatWaiting(true, "foreground")).toBe(true);
    expect(isForegroundChatWaiting(true, "background")).toBe(false);
    expect(isForegroundChatWaiting(false, "foreground")).toBe(false);
    expect(isForegroundChatWaiting(false, "background")).toBe(false);
  });
});
