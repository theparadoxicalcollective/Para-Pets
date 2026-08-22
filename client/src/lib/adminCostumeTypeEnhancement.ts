const COSTUME_VALUE = "costume";
const COSTUME_LABEL = "Costume";

function ensureCostumeOption(select: HTMLSelectElement): void {
  if (select.querySelector(`option[value="${COSTUME_VALUE}"]`)) return;
  const option = document.createElement("option");
  option.value = COSTUME_VALUE;
  option.textContent = COSTUME_LABEL;
  select.appendChild(option);
}

function syncCostumePriceField(select: HTMLSelectElement): void {
  const form = select.closest("div.fixed") ?? select.parentElement?.parentElement?.parentElement;
  const priceInput = form?.querySelector<HTMLInputElement>('[data-testid="input-item-price"]');
  if (!priceInput) return;

  const label = priceInput.parentElement?.querySelector("label");
  const isCostume = select.value === COSTUME_VALUE;
  if (label) label.textContent = isCostume ? "Costume Price" : "Price";
  priceInput.required = isCostume;
  priceInput.min = "0";
}

function installCostumePriceSync(select: HTMLSelectElement): void {
  if (select.dataset.costumePriceSyncInstalled === "true") {
    syncCostumePriceField(select);
    return;
  }
  select.dataset.costumePriceSyncInstalled = "true";
  select.addEventListener("change", () => syncCostumePriceField(select));
  syncCostumePriceField(select);
}

function getDatabaseCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="card-db-item-"]'));
}

function cardIsCostume(card: HTMLElement): boolean {
  return Array.from(card.querySelectorAll("span, p")).some(
    (node) => node.textContent?.trim().toLowerCase() === COSTUME_LABEL.toLowerCase(),
  );
}

function applyDatabaseCostumeFilter(active: boolean): void {
  for (const card of getDatabaseCards()) {
    card.style.display = !active || cardIsCostume(card) ? "" : "none";
  }
}

function addDatabaseCostumeFilter(): void {
  const row = document.querySelector<HTMLElement>('[data-testid="row-filter-tabs"]');
  if (!row || row.querySelector('[data-testid="tab-filter-costume"]')) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.testid = "tab-filter-costume";
  button.textContent = COSTUME_LABEL;
  button.className = "flex-shrink-0 px-3 py-1 rounded-full font-fantasy text-[10px] tracking-wider transition-all";
  button.style.cssText = "background:rgba(192,132,252,0.08);border:1px solid rgba(192,132,252,0.2);color:rgba(168,152,120,0.85);cursor:pointer;white-space:nowrap";

  button.addEventListener("click", () => {
    for (const sibling of Array.from(row.querySelectorAll<HTMLButtonElement>("button"))) {
      sibling.style.background = "rgba(0,0,0,0.25)";
      sibling.style.border = "1px solid rgba(212,160,23,0.2)";
      sibling.style.color = "rgba(168,152,120,0.85)";
    }
    button.style.background = "rgba(192,132,252,0.18)";
    button.style.border = "1px solid rgba(192,132,252,0.55)";
    button.style.color = "#c084fc";
    applyDatabaseCostumeFilter(true);
  });

  for (const sibling of Array.from(row.querySelectorAll<HTMLButtonElement>("button"))) {
    sibling.addEventListener("click", () => {
      button.style.background = "rgba(0,0,0,0.25)";
      button.style.border = "1px solid rgba(212,160,23,0.2)";
      button.style.color = "rgba(168,152,120,0.85)";
      applyDatabaseCostumeFilter(false);
    });
  }

  row.appendChild(button);
}

function addItemPickerCostumeFilter(): void {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h4")).find(
    (node) => node.textContent?.trim() === "Select Item",
  );
  if (!heading) return;

  const modal = heading.parentElement;
  if (!modal || modal.querySelector('[data-testid="tab-picker-filter-costume"]')) return;

  const chipContainer = heading.nextElementSibling;
  if (!(chipContainer instanceof HTMLElement)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.testid = "tab-picker-filter-costume";
  button.textContent = COSTUME_LABEL;
  button.className = "px-2 py-0.5 rounded-full font-fantasy text-[8px] tracking-wider transition-all";
  button.style.cssText = "background:rgba(0,0,0,0.25);border:1px solid rgba(212,160,23,0.12);color:#6a5840;cursor:pointer";

  button.addEventListener("click", () => {
    const cards = Array.from(modal.querySelectorAll<HTMLElement>('[data-testid^="button-pick-item-"]'));
    for (const card of cards) card.style.display = cardIsCostume(card) ? "" : "none";
    button.style.background = "rgba(192,132,252,0.13)";
    button.style.border = "1px solid rgba(192,132,252,0.55)";
    button.style.color = "#c084fc";
  });

  chipContainer.appendChild(button);
}

function syncAdminCostumeControls(): void {
  for (const select of Array.from(document.querySelectorAll<HTMLSelectElement>('select[data-testid="select-item-type"]'))) {
    ensureCostumeOption(select);
    installCostumePriceSync(select);
  }
  addDatabaseCostumeFilter();
  addItemPickerCostumeFilter();
}

let observer: MutationObserver | null = null;
let syncScheduled = false;
let syncing = false;

function scheduleAdminCostumeSync(): void {
  if (syncScheduled || syncing) return;
  syncScheduled = true;
  window.setTimeout(() => {
    syncScheduled = false;
    if (!observer || syncing) return;

    // Do not observe our own DOM writes. React can also replace large portions of
    // the admin tree while opening the Add/Edit Item dialog, so running a full-body
    // query for every individual mutation can lock the main thread.
    syncing = true;
    observer.disconnect();
    try {
      syncAdminCostumeControls();
    } finally {
      syncing = false;
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }, 50);
}

export function installAdminCostumeTypeEnhancement(): void {
  if (observer) return;
  syncAdminCostumeControls();
  observer = new MutationObserver(() => scheduleAdminCostumeSync());
  observer.observe(document.body, { childList: true, subtree: true });
}
