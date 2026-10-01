import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const normalizeSource = (source: string) => source.replace(/\s+/g, " ").trim();

test("WorldPage delegates Mixing Tree recipe UI to focused components", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /import \{ RecipeAlreadyRecordedModal, RecipeBookModal, RecipeDetailModal, type MixingTreeRecipe \} from "@\/components\/world\/MixingTreeRecipes"/,
  );
  assert.match(worldPage, /<RecipeAlreadyRecordedModal/);
  assert.match(worldPage, /<RecipeBookModal/);
  assert.match(worldPage, /<RecipeDetailModal/);

  assert.doesNotMatch(worldPage, /RecipeRowProp/);
  assert.doesNotMatch(worldPage, /interface RecipeRow/);
  assert.doesNotMatch(worldPage, /recipeBookOpen/);
  assert.doesNotMatch(worldPage, /recipeScrollIcon/);
});

test("Mixing Tree recipe component owns the shared recipe shape and existing modal controls", () => {
  const source = read("client/src/components/world/MixingTreeRecipes.tsx");
  const normalized = normalizeSource(source);

  assert.match(source, /export interface MixingTreeRecipe/);
  assert.match(source, /export function RecipeAlreadyRecordedModal/);
  assert.match(source, /export function RecipeBookModal/);
  assert.match(source, /export function RecipeDetailModal/);

  for (const marker of [
    "button-close-already-unlocked",
    "button-close-recipe-book",
    "button-recipe-icon-",
    "Recipe already recorded",
    "Recipe Book",
    "Find recipe scrolls in the market and drag them onto the cauldron to unlock recipes!",
  ]) {
    assert.equal(normalized.includes(marker), true, marker);
  }
});

test("recipe book preserves locked and unlocked presentation behavior", () => {
  const source = read("client/src/components/world/MixingTreeRecipes.tsx");

  assert.match(
    source,
    /recipes[\s\S]*?filter\(\(recipe\) => unlockedRecipeIds\.includes\(recipe\.id\)\)/,
  );
  assert.match(
    source,
    /recipes[\s\S]*?filter\(\(recipe\) => !unlockedRecipeIds\.includes\(recipe\.id\)\)/,
  );
  assert.match(source, /onClick=\{\(\) => onSelectRecipe\(recipe\)\}/);
  assert.match(source, />\s*unlocked\s*<\/p>/);
  assert.match(source, />\s*Locked\s*<\/p>/);
});

test("WorldPage keeps recipe data and unlock behavior while removing dead local admin mutations", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /const \{ data: recipes = \[\] \} = useQuery<MixingTreeRecipe\[]>\(\{/,
  );
  assert.match(worldPage, /queryKey: \["\/api\/recipes"\]/);
  assert.match(worldPage, /queryKey: \["\/api\/recipes\/unlocked"\]/);
  assert.match(
    worldPage,
    /apiRequest\("POST", "\/api\/recipes\/unlock", \{ inventoryId \}\)/,
  );
  assert.match(
    worldPage,
    /if \(data\?\.recipe\) setRecipeDetail\(data\.recipe as MixingTreeRecipe\)/,
  );

  assert.doesNotMatch(worldPage, /refetchRecipes/);
  assert.doesNotMatch(worldPage, /addRecipeMutation/);
  assert.doesNotMatch(worldPage, /deleteRecipeMutation/);
});
