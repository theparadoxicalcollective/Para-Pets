import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync("client/src/components/NpcQuestAwareDialogueBridge.tsx", "utf8");
const main = readFileSync("client/src/main.tsx", "utf8");

describe("quest-aware NPC dialogue handoff", () => {
  it("mounts the quest-aware dialogue bridge", () => {
    expect(main).toContain('import NpcQuestAwareDialogueBridge from "./components/NpcQuestAwareDialogueBridge"');
    expect(main).toContain("<NpcQuestAwareDialogueBridge />");
  });

  it("only restores Ginny generic dialogue after the one-time quest is claimed", () => {
    expect(bridge).toContain('const GINNY_QUEST_KEY = "ginny_mini_pet_companion"');
    expect(bridge).toContain('if (ginnyStatus !== "claimed") return [];');
  });

  it("loads the live player quest state instead of treating registry association as availability", () => {
    expect(bridge).toContain('fetch("/api/quests/ginny-mini-pet"');
    expect(bridge).toContain("getNpcQuestAssociations(location.name, location.worldId)");
  });

  it("restores click dialogue for both player and admin interaction paths", () => {
    expect(bridge).toContain("button-quest-finished-talk-npc-");
    expect(bridge).toContain('admin-location-hotspot-');
    expect(bridge).toContain("chooseNpcMessage(messages");
  });

  it("fails closed while quest state is unknown", () => {
    expect(bridge).toContain("if (ginnyStatus !== \"claimed\") return [];");
    expect(bridge).toContain("setGinnyStatus(null)");
  });
});
