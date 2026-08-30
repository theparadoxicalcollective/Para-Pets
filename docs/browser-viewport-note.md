# Mobile browser viewport guardrail

Para Pets treats the installed PWA/web app as the full-screen mobile baseline.

Normal mobile browsers may report a `visualViewport.height` that is temporarily shorter than the page viewport because browser chrome is expanded. The game stage must not treat that toolbar-only difference as the real game height or it can leave a black strip below the rendered stage.

Compatibility rule:

- Installed standalone/PWA mode keeps the existing `visualViewport` sizing contract.
- Normal phone browsers use the layout viewport for ordinary browser-toolbar changes.
- A large visual-viewport reduction consistent with the software keyboard still uses `visualViewport.height` so focused controls remain usable.
- Phone layouts remain native and unscaled.
- Tablet/desktop layouts continue using the centered 390x844 portrait stage.

This is intentionally a viewport-measurement fix, not a responsive-layout redesign.
