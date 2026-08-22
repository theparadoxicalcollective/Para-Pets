const COSTUME_LABEL = "Costume";
const COSTUME_BUTTON_TEST_ID = "button-pet-parts-costume";

function isAdminPage(): boolean {
  return window.location.pathname.toLowerCase().includes("admin");
}

function findPetPartsHeading(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,button,label,p,span"))
    .find((node) => node.textContent?.trim().toLowerCase() === "pet parts") ?? null;
}

function createCostumeButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.testid = COSTUME_BUTTON_TEST_ID;
  button.textContent = COSTUME_LABEL;
  button.className = "px-3 py-1.5 rounded-lg font-fantasy text-[10px] tracking-wider transition-all";
  button.style.cssText = [
    "background:linear-gradient(135deg,rgba(192,132,252,.22),rgba(126,34,206,.12))",
    "border:1px solid rgba(192,132,252,.55)",
    "color:#d8b4fe",
    "cursor:pointer",
    "white-space:nowrap",
  ].join(";");

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const response = await fetch("/api/admin/costumes", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load costumes");
      const costumes = await response.json() as Array<{ id: string; name: string; imageUrl: string | null }>;

      const existing = document.querySelector<HTMLElement>('[data-testid="modal-admin-costume-library"]');
      existing?.remove();

      const modal = document.createElement("div");
      modal.dataset.testid = "modal-admin-costume-library";
      modal.style.cssText = "position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72)";

      const panel = document.createElement("div");
      panel.style.cssText = "width:min(640px,100%);max-height:88vh;overflow:auto;border-radius:14px;padding:16px;background:linear-gradient(145deg,#21150d,#302015);border:1px solid rgba(192,132,252,.45);color:#e7d7b5";
      panel.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><strong style="flex:1;color:#d8b4fe;font-size:14px">Costume</strong><button type="button" data-costume-close style="border:1px solid rgba(240,192,64,.3);background:rgba(0,0,0,.3);color:#a89878;border-radius:8px;padding:5px 9px">Close</button></div>`;

      const list = document.createElement("div");
      list.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px";
      if (!costumes.length) {
        list.innerHTML = `<div style="grid-column:1/-1;padding:20px;text-align:center;color:#a89878">No Costume items have been created yet. Add a Costume item first.</div>`;
      } else {
        costumes.forEach((costume) => {
          const card = document.createElement("button");
          card.type = "button";
          card.dataset.costumeId = costume.id;
          card.style.cssText = "text-align:left;padding:8px;border-radius:10px;background:rgba(0,0,0,.25);border:1px solid rgba(192,132,252,.22);color:#e7d7b5;cursor:pointer";
          card.innerHTML = `${costume.imageUrl ? `<img src="${costume.imageUrl}" alt="" style="width:100%;height:90px;object-fit:contain;border-radius:6px;background:rgba(0,0,0,.2);margin-bottom:6px">` : ""}<div style="font-size:10px;color:#d8b4fe;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${costume.name}</div>`;
          card.addEventListener("click", () => {
            document.dispatchEvent(new CustomEvent("para-pets:admin-costume-selected", { detail: costume }));
            card.style.borderColor = "rgba(127,255,212,.7)";
          });
          list.appendChild(card);
        });
      }

      panel.appendChild(list);
      modal.appendChild(panel);
      document.body.appendChild(modal);
      panel.querySelector<HTMLButtonElement>("[data-costume-close]")?.addEventListener("click", () => modal.remove());
      modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
    } catch {
      window.alert("Could not load Costume items. Please try again.");
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function syncCostumePetPartsControl(): void {
  if (!isAdminPage()) return;
  const heading = findPetPartsHeading();
  if (!heading) return;
  const existing = document.querySelector<HTMLButtonElement>(`[data-testid="${COSTUME_BUTTON_TEST_ID}"]`);
  if (existing) return;

  const container = heading.parentElement;
  if (!container) return;
  container.appendChild(createCostumeButton());
}

let observer: MutationObserver | null = null;

export function installAdminCostumePetPartsIntegration(): void {
  if (observer) return;
  syncCostumePetPartsControl();
  observer = new MutationObserver(syncCostumePetPartsControl);
  observer.observe(document.body, { childList: true, subtree: true });
}
