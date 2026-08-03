# Pet Care mobile acceptance matrix

Run each interaction row on (A) iPhone 12 home-screen standalone, (B) iPhone 12 Safari, and (C) an iOS embedded/in-app browser.

- [ ] A remains visually identical at 390×844: pet, Mood, Hunger, Loyalty, shelves, controls, notch and home-indicator spacing have not moved or scaled.
- [ ] B and C preserve that complete composition with one uniform scale; browser controls overlap nothing and Hunger/shelves remain visible.
- [ ] No environment stretches, rearranges, independently repositions, or changes the centered pet.
- [ ] Drag and apply one edible and one gift.
- [ ] Cancel a drag; confirm no item applies and no ghost/glow remains.
- [ ] Select an item and tap the pet; confirm it applies once. Confirm stacked edible selection opens the quantity chooser.
- [ ] Repeat at least 20 item interactions; confirm no stuck ghost, selection, glow, or busy state.
- [ ] Close/reopen Pet Care, then background/restore the page.
- [ ] Confirm WebKit never shows “A problem repeatedly occurred”.
