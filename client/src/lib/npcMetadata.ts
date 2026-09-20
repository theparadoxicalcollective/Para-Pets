export type NpcAnimationType = "none" | "breathe" | "float";

export interface NpcMetadata {
  animation: NpcAnimationType;
  messages: string[];
}

export interface NpcQuestAssociation {
  key: string;
  title: string;
  npcName: string;
  worldId: string;
}

const NPC_METADATA_PREFIX = "para:npc:v1:";
const MAX_NPC_MESSAGES = 3;
const MAX_NPC_MESSAGE_LENGTH = 220;

export const DEFAULT_NPC_METADATA: NpcMetadata = {
  animation: "none",
  messages: [],
};

// Keep NPC quest bindings in one small registry so Administration Realm can
// show them and generic NPC click handling can defer to the quest interaction.
// Add future NPC-bound quests here when they are introduced.
export const NPC_QUEST_ASSOCIATIONS: readonly NpcQuestAssociation[] = [
  {
    key: "ginny_mini_pet_companion",
    title: "Ginny's Little Companion",
    npcName: "Ginny",
    worldId: "haunted_woods",
  },
  { key: "catch_fish", title: "Gone Fishing", npcName: "Janson", worldId: "swamp" },
  { key: "sell_fish", title: "Sell Fish", npcName: "Janson", worldId: "swamp" },
];

export function normalizeNpcName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

export function npcNamesMatch(left: unknown, right: unknown): boolean {
  const a = normalizeNpcName(left);
  const b = normalizeNpcName(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

function sanitizeMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is string => typeof message === "string")
    .map(message => message.trim().slice(0, MAX_NPC_MESSAGE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_NPC_MESSAGES);
}

export function parseNpcMetadata(value: unknown): NpcMetadata {
  if (typeof value !== "string" || !value.startsWith(NPC_METADATA_PREFIX)) {
    return { ...DEFAULT_NPC_METADATA, messages: [] };
  }

  try {
    const parsed = JSON.parse(value.slice(NPC_METADATA_PREFIX.length)) as Partial<NpcMetadata>;
    const animation: NpcAnimationType = parsed.animation === "breathe" || parsed.animation === "float"
      ? parsed.animation
      : "none";
    return {
      animation,
      messages: sanitizeMessages(parsed.messages),
    };
  } catch {
    return { ...DEFAULT_NPC_METADATA, messages: [] };
  }
}

export function serializeNpcMetadata(metadata: NpcMetadata): string {
  const animation: NpcAnimationType = metadata.animation === "breathe" || metadata.animation === "float"
    ? metadata.animation
    : "none";
  return `${NPC_METADATA_PREFIX}${JSON.stringify({
    animation,
    messages: sanitizeMessages(metadata.messages),
  })}`;
}

export function getNpcQuestAssociations(name: unknown, worldId?: unknown): NpcQuestAssociation[] {
  const normalizedWorld = typeof worldId === "string" ? worldId.trim().toLowerCase() : "";
  return NPC_QUEST_ASSOCIATIONS.filter(quest => {
    if (!npcNamesMatch(name, quest.npcName)) return false;
    return !normalizedWorld || normalizedWorld === quest.worldId.toLowerCase();
  });
}

export function chooseNpcMessage(
  messages: readonly string[],
  previousMessage?: string | null,
  random: () => number = Math.random,
): string | null {
  const available = sanitizeMessages(messages);
  if (available.length === 0) return null;

  const pool = available.length > 1 && previousMessage
    ? available.filter(message => message !== previousMessage)
    : available;
  const choices = pool.length > 0 ? pool : available;
  const index = Math.min(choices.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * choices.length));
  return choices[index] ?? null;
}
