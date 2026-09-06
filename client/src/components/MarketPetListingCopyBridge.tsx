import { useEffect } from "react";

function normalizeMarketPetListingModal(root: ParentNode = document) {
  const confirm = root.querySelector<HTMLElement>('[data-testid="button-revert-confirm"]');
  if (!confirm) return;

  const modalCard = confirm.parentElement?.parentElement;
  if (!modalCard) return;

  const heading = modalCard.querySelector("h2");
  if (heading) heading.textContent = "List Hatched Pet";

  const copy = modalCard.querySelector("p");
  if (copy) {
    copy.textContent = "This pet will stay hatched and keep its current stats. Any equipped accessories and adornments will be unequipped and remain in your inventory before the pet is listed.";
  }

  const decorativeEgg = modalCard.querySelector<HTMLImageElement>("img");
  if (decorativeEgg) decorativeEgg.style.display = "none";

  confirm.textContent = confirm.hasAttribute("disabled") ? "Listing…" : "List Pet";
  confirm.setAttribute("aria-label", "List hatched pet for sale");
}

/**
 * Compatibility bridge for the legacy market-pet confirmation modal.
 * The underlying endpoint name/test id still reflects the old egg-revert flow,
 * but hatched pets now stay hatched. Keep player-facing copy aligned with the
 * authoritative transaction behavior until the legacy modal is retired.
 */
export default function MarketPetListingCopyBridge() {
  useEffect(() => {
    normalizeMarketPetListingModal();

    const observer = new MutationObserver(() => normalizeMarketPetListingModal());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
