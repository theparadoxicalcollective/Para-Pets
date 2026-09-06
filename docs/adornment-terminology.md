# Adornment terminology

Para Pets uses **Adornment / Adornments** as the player- and administrator-facing name for wearable cosmetic pieces.

## Compatibility rule

Some older database rows, equipment tables, API paths, component names, and item discriminators use the historical word `costume`. Those identifiers are compatibility contracts and are not player-facing terminology. They remain accepted so existing owned/equipped pieces and saved data continue to work.

The UI terminology bridge normalizes visible text, option labels (including Administration item-type/category selectors), accessibility labels, titles, and placeholders from Costume/Costumes to Adornment/Adornments. It intentionally does not rewrite form `value` attributes or API paths.

When touching legacy code, new visible copy should use Adornment/Adornments directly. Do not introduce new user-visible Costume/Costumes wording.