from pathlib import Path

animator_path = Path("client/src/components/PetAnimator.tsx")
test_path = Path("test/costumeAnimatedRenderer.test.ts")

animator = animator_path.read_text()
old = '''  const renderCostumes = !!resolvedPetInventoryId && equipped.length > 0 && viewParts.length > 0;\n  const hasAboveHead = viewParts.some(part => basePartType(part.partType) === "above_head");\n\n  const costumeLayer = (depth: "front" | "back") => ('''
new = '''  const renderCostumes = !!resolvedPetInventoryId && equipped.length > 0 && viewParts.length > 0;\n  const hasAboveHead = viewParts.some(part => basePartType(part.partType) === "above_head");\n  // Above-head parts are intentionally re-rendered in the z=3 top layer while\n  // costumes are visible so crowns/halos/hats stay above front costume pieces.\n  // Hide those exact source parts from PetAnimatorCore at the same time.\n  // Otherwise the same artwork exists twice and the two copies drift apart\n  // after a refetch/re-render restarts the late top-layer animation phase.\n  const hiddenCorePartTypes = useMemo(() => {\n    const hidden = new Set(hiddenWingPartTypes);\n    if (renderCostumes && hasAboveHead) {\n      for (const part of viewParts) {\n        if (basePartType(part.partType) === "above_head") hidden.add(part.partType);\n      }\n    }\n    return hidden;\n  }, [hiddenWingPartTypes, renderCostumes, hasAboveHead, viewParts]);\n\n  const costumeLayer = (depth: "front" | "back") => ('''
if old not in animator:
    raise SystemExit("PetAnimator insertion anchor not found")
animator = animator.replace(old, new, 1)
old_prop = '          hiddenPartTypes={hiddenWingPartTypes}\n'
new_prop = '          hiddenPartTypes={hiddenCorePartTypes}\n'
if old_prop not in animator:
    raise SystemExit("PetAnimator hiddenPartTypes prop anchor not found")
animator = animator.replace(old_prop, new_prop, 1)
animator_path.write_text(animator)

test = test_path.read_text()
old_assert = '  assert.match(animator, /hiddenPartTypes=\\{hiddenWingPartTypes\\}/);\n'
new_assert = '  assert.match(animator, /hiddenPartTypes=\\{hiddenCorePartTypes\\}/);\n'
if old_assert not in test:
    raise SystemExit("wing hidden-part test anchor not found")
test = test.replace(old_assert, new_assert, 1)
anchor = 'test("head-mounted costumes inherit the same head-group wrapper motion as the pet", () => {'
new_test = '''test("above-head source parts are hidden from the core while the top costume layer is active", () => {\n  assert.match(animator, /const hiddenCorePartTypes = useMemo/);\n  assert.match(animator, /if \(renderCostumes && hasAboveHead\)/);\n  assert.match(animator, /basePartType\(part\.partType\) === "above_head"\) hidden\.add\(part\.partType\)/);\n  assert.match(animator, /hiddenPartTypes=\{hiddenCorePartTypes\}/);\n  assert.match(animator, /data-testid="pet-animator-above-head-top"/);\n});\n\n'''
if anchor not in test:
    raise SystemExit("test insertion anchor not found")
test = test.replace(anchor, new_test + anchor, 1)
test_path.write_text(test)
