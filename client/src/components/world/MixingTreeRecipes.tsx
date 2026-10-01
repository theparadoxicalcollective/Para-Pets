import { X } from "lucide-react";

const recipeBookOpen = "/recipe-book-open.png";
const recipeScrollIcon = "/recipe-scroll-icon.png";

export interface MixingTreeRecipe {
  id: string;
  result_type: string;
  recipe_item_id?: string | null;
  recipe_item_name?: string | null;
  recipe_item_image?: string | null;
  ing1_id: string;
  ing1_name: string;
  ing1_image: string | null;
  ing2_id: string;
  ing2_name: string;
  ing2_image: string | null;
  result_id: string;
  result_name: string;
  result_image: string | null;
  result_item_type: string;
}

export function RecipeAlreadyRecordedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative z-10 flex flex-col items-center gap-3 rounded-2xl px-7 py-6"
        style={{
          background:
            "linear-gradient(160deg, rgba(12,28,22,0.98) 0%, rgba(8,40,32,0.98) 100%)",
          border: "1.5px solid rgba(94,234,212,0.35)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          minWidth: 240,
        }}
      >
        <div className="flex items-center justify-center gap-2">
          <img src={recipeScrollIcon} alt="" className="w-7 h-7 object-contain" />
          <p
            className="font-fantasy text-base tracking-widest text-center"
            style={{ color: "#5eead4", letterSpacing: "0.1em" }}
          >
            Recipe already recorded
          </p>
        </div>
        <p
          className="font-fantasy text-xs text-center"
          style={{ color: "#5eead488" }}
        >
          You already know this recipe!
        </p>
        <button
          data-testid="button-close-already-unlocked"
          onClick={onClose}
          className="mt-1 font-fantasy text-xs tracking-wider px-5 py-2 rounded-full active:scale-95 transition-transform"
          style={{
            background: "rgba(94,234,212,0.12)",
            border: "1.5px solid rgba(94,234,212,0.4)",
            color: "#5eead4",
            cursor: "pointer",
          }}
        >
          ✕ Close
        </button>
      </div>
    </div>
  );
}

export function RecipeBookModal({
  open,
  recipes,
  unlockedRecipeIds,
  onClose,
  onSelectRecipe,
}: {
  open: boolean;
  recipes: MixingTreeRecipe[];
  unlockedRecipeIds: string[];
  onClose: () => void;
  onSelectRecipe: (recipe: MixingTreeRecipe) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-auto"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full mx-4 rounded-2xl overflow-hidden"
        style={{
          maxWidth: 340,
          background:
            "linear-gradient(160deg, rgba(12,28,22,0.98) 0%, rgba(8,40,32,0.98) 100%)",
          border: "1.5px solid rgba(94,234,212,0.35)",
          boxShadow:
            "0 0 60px rgba(0,0,0,0.8), 0 0 30px rgba(45,212,191,0.12)",
        }}
      >
        <button
          data-testid="button-close-recipe-book"
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center z-10"
          style={{
            background: "rgba(94,234,212,0.15)",
            border: "1px solid rgba(94,234,212,0.35)",
            color: "#5eead4",
            cursor: "pointer",
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex flex-col items-center px-4 pt-4 pb-2">
          <img
            src={recipeBookOpen}
            alt="Recipe Book"
            className="object-contain mb-2"
            style={{
              width: 72,
              height: 72,
              filter: "drop-shadow(0 2px 12px rgba(94,234,212,0.35))",
            }}
          />
          <h3
            className="font-fantasy text-sm tracking-[0.2em]"
            style={{
              color: "#5eead4",
              textShadow: "0 0 12px rgba(94,234,212,0.4)",
            }}
          >
            Recipe Book
          </h3>
          <p
            className="font-fantasy text-[10px] mt-0.5"
            style={{ color: "#5eead466" }}
          >
            {unlockedRecipeIds.length}/{recipes.length} unlocked
          </p>
        </div>

        <div
          className="px-4 pb-4 overflow-y-auto"
          style={{ maxHeight: "calc(55*var(--vh))" }}
        >
          {recipes.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <img
                src={recipeScrollIcon}
                alt=""
                className="w-16 h-16 object-contain opacity-30"
              />
              <p
                className="font-fantasy text-xs text-center"
                style={{ color: "#5eead455" }}
              >
                Find recipe scrolls in the market and drag them onto the cauldron
                to unlock recipes!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {recipes
                .filter((recipe) => unlockedRecipeIds.includes(recipe.id))
                .map((recipe) => (
                  <button
                    key={recipe.id}
                    data-testid={`button-recipe-icon-${recipe.id}`}
                    onClick={() => onSelectRecipe(recipe)}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl active:scale-95 transition-transform"
                    style={{
                      background: "rgba(94,234,212,0.07)",
                      border: "1.5px solid rgba(94,234,212,0.28)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="relative w-14 h-14 flex items-center justify-center">
                      <img
                        src={recipeScrollIcon}
                        alt=""
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{ opacity: 0.55 }}
                      />
                      {recipe.result_image && (
                        <img
                          src={recipe.result_image}
                          alt=""
                          className="relative w-8 h-8 object-contain"
                          style={{
                            filter:
                              "drop-shadow(0 1px 3px rgba(0,0,0,0.7))",
                          }}
                        />
                      )}
                    </div>
                    <p
                      className="font-fantasy text-[9px] text-center leading-tight line-clamp-2"
                      style={{ color: "#d1faf3" }}
                    >
                      {recipe.result_name}
                    </p>
                    <p
                      className="font-fantasy text-[8px]"
                      style={{ color: "#5eead466" }}
                    >
                      unlocked
                    </p>
                  </button>
                ))}

              {recipes
                .filter((recipe) => !unlockedRecipeIds.includes(recipe.id))
                .map((recipe) => (
                  <div
                    key={recipe.id}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1.5px solid rgba(80,80,80,0.22)",
                    }}
                  >
                    <div className="relative w-14 h-14 flex items-center justify-center">
                      <img
                        src={recipeScrollIcon}
                        alt=""
                        className="w-full h-full object-contain"
                        style={{ opacity: 0.18, filter: "grayscale(1)" }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          fontSize: 18,
                          color: "#55555588",
                        }}
                      >
                        ?
                      </span>
                    </div>
                    <p
                      className="font-fantasy text-[9px] text-center"
                      style={{ color: "#55555588" }}
                    >
                      Locked
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RecipeDetailModal({
  recipe,
  onClose,
}: {
  recipe: MixingTreeRecipe | null;
  onClose: () => void;
}) {
  if (!recipe) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-auto"
      style={{ maxWidth: "768px", margin: "0 auto", left: 0, right: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative z-10 w-[85%] max-w-[300px] rounded-2xl overflow-hidden p-6 flex flex-col items-center gap-4"
        style={{
          background:
            "linear-gradient(160deg, rgba(12,28,22,0.99) 0%, rgba(8,40,32,0.99) 100%)",
          border: "1.5px solid rgba(94,234,212,0.4)",
          boxShadow:
            "0 0 60px rgba(0,0,0,0.85), 0 0 30px rgba(45,212,191,0.14)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(94,234,212,0.15)",
            border: "1px solid rgba(94,234,212,0.35)",
            color: "#5eead4",
            cursor: "pointer",
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex flex-col items-center gap-1">
          <div
            className="w-20 h-20 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(94,234,212,0.2)",
            }}
          >
            {recipe.recipe_item_image ? (
              <img
                src={recipe.recipe_item_image}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <img
                src={recipeScrollIcon}
                alt=""
                className="w-14 h-14 object-contain opacity-60"
              />
            )}
          </div>
          <p
            className="font-fantasy text-sm tracking-wider text-center mt-1"
            style={{ color: "#5eead4" }}
          >
            {recipe.result_name}
          </p>
          <p
            className="font-fantasy text-[10px]"
            style={{ color: "#5eead455" }}
          >
            Recipe
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 w-full">
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-14 rounded-xl overflow-hidden"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(94,234,212,0.18)",
              }}
            >
              {recipe.ing1_image ? (
                <img
                  src={recipe.ing1_image}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full" />
              )}
            </div>
            <p
              className="font-fantasy text-[9px] text-center leading-tight"
              style={{ color: "#c8f4ed", maxWidth: 56 }}
            >
              {recipe.ing1_name}
            </p>
          </div>

          <div className="flex flex-col items-center gap-1">
            <span
              className="font-fantasy text-base"
              style={{ color: "#5eead488" }}
            >
              +
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-14 rounded-xl overflow-hidden"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(94,234,212,0.18)",
              }}
            >
              {recipe.ing2_image ? (
                <img
                  src={recipe.ing2_image}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full" />
              )}
            </div>
            <p
              className="font-fantasy text-[9px] text-center leading-tight"
              style={{ color: "#c8f4ed", maxWidth: 56 }}
            >
              {recipe.ing2_name}
            </p>
          </div>

          <span className="font-fantasy text-base" style={{ color: "#5eead488" }}>
            →
          </span>

          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-14 rounded-xl overflow-hidden"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(94,234,212,0.3)",
              }}
            >
              {recipe.result_image ? (
                <img
                  src={recipe.result_image}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full" />
              )}
            </div>
            <p
              className="font-fantasy text-[9px] text-center leading-tight"
              style={{ color: "#c8f4ed", maxWidth: 56 }}
            >
              {recipe.result_name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
