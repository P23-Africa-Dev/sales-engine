import { describe, expect, it } from "vitest";
import type { ChatMessageApi } from "@/lib/api/sales-engine";
import {
  mapApiMessagesToUi,
  mergeServerHistoryWithLocal,
  type MergeableChatMessage,
} from "./use-sales-engine-chat";

const serverHistory: ChatMessageApi[] = [
  { id: 101, role: "user", body: "find logistics partners", intent: "freeform" },
  { id: 102, role: "assistant", body: "Sure — here is what I found.", intent: "freeform" },
];

describe("mergeServerHistoryWithLocal", () => {
  it("keeps the ICP confirm card (and its prompt) across a history refresh", () => {
    const local: MergeableChatMessage[] = [
      ...mapApiMessagesToUi(serverHistory),
      { id: 103, role: "user", body: "give me prospects", intent: "generate_leads", localOnly: true },
      { id: 104, role: "assistant", body: "", kind: "confirm-icp", localOnly: true },
    ];

    // The refetched history does not contain the client-only messages yet.
    const merged = mergeServerHistoryWithLocal<MergeableChatMessage>(mapApiMessagesToUi(serverHistory), local);

    expect(merged.map((message) => message.id)).toEqual([101, 102, 103, 104]);
    expect(merged.at(-1)?.kind).toBe("confirm-icp");
  });

  it("keeps the confirm card when the server history is empty", () => {
    const local: MergeableChatMessage[] = [
      { id: 2, role: "user", body: "give me prospects", intent: "generate_leads", localOnly: true },
      { id: 3, role: "assistant", body: "", kind: "confirm-icp", localOnly: true },
    ];

    expect(mergeServerHistoryWithLocal<MergeableChatMessage>([], local).map((m) => m.kind)).toEqual([
      undefined,
      "confirm-icp",
    ]);
  });

  it("drops a sent prompt once the server has it, carrying its Mode caption over", () => {
    const local: MergeableChatMessage[] = [
      {
        id: 7,
        role: "user",
        body: "give me prospects",
        intent: "generate_leads",
        entityMode: "people",
        searchCaption: "logistics 3PL operators",
        localOnly: true,
      },
      { id: 8, role: "assistant", body: "Using **Ops**. Generating prospects…", localOnly: true },
    ];
    const server = mapApiMessagesToUi([
      { id: 201, role: "user", body: "give me prospects", intent: "generate_leads" },
      { id: 202, role: "assistant", body: "", intent: "generate_leads", meta: { pending: true } },
    ]);

    const merged = mergeServerHistoryWithLocal<MergeableChatMessage>(server, local);

    expect(merged.map((message) => message.id)).toEqual([201, 202]);
    expect(merged[0].entityMode).toBe("people");
    expect(merged[0].searchCaption).toBe("logistics 3PL operators");
  });

  it("drops server-echoed assistant messages that were not local-only", () => {
    const local: MergeableChatMessage[] = [{ id: 9, role: "assistant", body: "old copy" }];
    expect(mergeServerHistoryWithLocal<MergeableChatMessage>([], local)).toEqual([]);
  });
});

describe("mapApiMessagesToUi", () => {
  it("reads entity_mode and search_caption from message meta", () => {
    const [message] = mapApiMessagesToUi([
      {
        id: 1,
        role: "user",
        body: "give me prospects",
        intent: "generate_leads",
        meta: { entity_mode: "companies", search_caption: "fleet operators", count: 25 },
      },
    ]);

    expect(message.entityMode).toBe("companies");
    expect(message.searchCaption).toBe("fleet operators");
    expect(message.targetCount).toBe(25);
  });

  it("ignores unknown entity modes from older backends", () => {
    const [message] = mapApiMessagesToUi([
      { id: 1, role: "user", body: "x", meta: { entity_mode: "accounts" } },
    ]);
    expect("entityMode" in message).toBe(false);
  });
});
