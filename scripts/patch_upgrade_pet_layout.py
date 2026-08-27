from pathlib import Path

files = [
    Path("client/src/components/PetPowerUpPage.tsx"),
    Path("client/src/components/PetLevelUpPage.tsx"),
]

old = '<PetAnimator petTemplateId={petTemplateId} petInventoryId={petInventoryId} mode="idle" view="front" size={700} className="w-full" style={{ aspectRatio: "1/1", pointerEvents: "none" }} />'
new = '<PetAnimator petTemplateId={petTemplateId} petInventoryId={petInventoryId} mode="idle" view="front" size={350} fillContainer className="w-full h-full" style={{ width: "100%", height: "100%", pointerEvents: "none" }} />'

for path in files:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Pet animator layout anchor not found in {path}")
    path.write_text(text.replace(old, new, 1))

Path("test/upgradeAnimatedPetLayout.test.ts").write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");\nconst level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");\n\nfor (const [name, source] of [["Power Up", power], ["Level Up", level]] as const) {\n  test(`${name} animated pet stays inside its existing pet zone`, () => {\n    assert.match(source, /<PetAnimator[\\s\\S]*?size=\\{350\\}[\\s\\S]*?fillContainer/);\n    assert.match(source, /className="w-full h-full"/);\n    assert.match(source, /style=\\{\\{ width: "100%", height: "100%", pointerEvents: "none" \\}\\}/);\n    assert.doesNotMatch(source, /<PetAnimator[^>]*size=\\{700\\}/);\n  });\n}\n''')
