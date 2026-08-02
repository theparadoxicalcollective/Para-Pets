# Item artwork normalization

The Pet Care Edibles and Gifts shelves normalize item artwork in the browser. A
shared, URL-keyed promise cache loads each image once, samples its alpha channel
at up to 512 pixels on the longest edge, and uses the resulting visible bounds
to draw only the non-transparent extent with contain-style scaling. Original
item files and records remain unchanged, and unreadable/CORS-blocked images use
the previous `object-fit: contain` presentation.

## Recommended follow-up

The shop-item upload path currently converts and resizes images but does not
persist alpha bounds. A future, separately scoped schema/API change should use
Sharp during upload to calculate the same thresholded bounds and store that
metadata (or a non-destructive tightly trimmed derivative) alongside the
original. Existing records must remain nullable/backward compatible, and the
original source must remain available to admin editing and other game views.
