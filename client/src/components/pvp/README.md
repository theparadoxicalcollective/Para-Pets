# PvP live pet rendering

Live battle pets use `PvpLivePetCanvas`, which keeps the layered idle animation while compositing each pet into a single small canvas. Small roster and picker thumbnails intentionally remain still images.

The battle renderer runs at 30 fps for 1–3 pets per side and 24 fps for 4–5 pets per side. Countdown prewarming is limited to one 32 px / 15 fps canvas per unique template and unmounts when the battle starts. Knocked-out pets and pets without template data keep the existing still-image path.
