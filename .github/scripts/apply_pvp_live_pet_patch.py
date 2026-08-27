from pathlib import Path

path = Path("client/src/pages/PvpBattlePage.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    'import type { BattlePotionSlot } from "@/components/BattleArena";\n',
    'import type { BattlePotionSlot } from "@/components/BattleArena";\n'
    'import { PvpLivePetCanvas, PvpPetCanvasPrewarm } from "@/components/pvp/PvpLivePetCanvas";\n',
    "PvP live-pet import",
)

replace_once(
    '''      {phase === "countdown" && (\n        <div className="flex-1 flex items-center justify-center relative z-10">\n          <div className="text-6xl font-black text-white" style={{ textShadow: "0 0 40px rgba(239,68,68,0.8)" }}>\n            {countdown > 0 ? countdown : "FIGHT!"}\n          </div>\n        </div>\n      )}\n''',
    '''      {phase === "countdown" && (\n        <div className="flex-1 flex items-center justify-center relative z-10">\n          <PvpPetCanvasPrewarm\n            templateIds={pets.flatMap((pet) => pet.petTemplateId ? [pet.petTemplateId] : [])}\n          />\n          <div className="text-6xl font-black text-white" style={{ textShadow: "0 0 40px rgba(239,68,68,0.8)" }}>\n            {countdown > 0 ? countdown : "FIGHT!"}\n          </div>\n        </div>\n      )}\n''',
    "PvP countdown prewarm",
)

replace_once(
    '''                >\n                  {pet.imageUrl ? (\n                    <img\n''',
    '''                >\n                  {pet.petTemplateId && !isDead ? (\n                    <PvpLivePetCanvas\n                      petTemplateId={pet.petTemplateId}\n                      fallbackImageUrl={pet.imageUrl}\n                      size={size}\n                      isPlayer={pet.isPlayer}\n                      isHit={isHit}\n                      isSkillReady={isSkillReady}\n                      crowded={sideCount >= 4}\n                    />\n                  ) : pet.imageUrl ? (\n                    <img\n''',
    "PvP live battle sprite",
)

old_comment = '''                {/* Sprite — PvP renders pets as plain <img> tags using\n                    the shop_item.imageUrl (the full-body PNG admins\n                    upload for every pet). No PetAnimatorCanvas, no\n                    per-frame redraw loop, no FPS throttle — just the\n                    GPU compositing one small image per pet. The\n                    canvas approach was originally added to prevent\n                    iOS GPU crashes from the part-based <img> renderer\n                    (12 textures × N pets), but a SINGLE <img> per pet\n                    has none of that risk and runs essentially for\n                    free. All "alive" feel comes from CSS effects on\n                    impact / charge / defeat instead of idle motion.\n                    The enemy gets a horizontal flip via scaleX(-1) so\n                    it faces the player. The wrapper is\n                    `position: relative` so any absolute children\n                    (X_X hit overlay) resolve to THIS box, not to the\n                    outer flex column. */}\n'''
new_comment = '''                {/* Sprite — live template pets use the memory-safe one-canvas\n                    renderer so breathing, blinking, ears, tails, wings, and\n                    other idle part motion can run without promoting every\n                    transparent body part to its own iOS GPU texture. The\n                    battle's outer wrapper still owns charge/lunge positioning,\n                    hit testing, bars, and KO state. Legacy pets without a\n                    template — plus knocked-out player pets — keep the existing\n                    single-image path so the downed pose and fallbacks remain\n                    unchanged. The enemy flip stays on the parent wrapper. */}\n'''
replace_once(old_comment, new_comment, "PvP sprite documentation")

path.write_text(text)
