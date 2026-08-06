import { useMemo, useState, type ReactNode } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { itemTypeLabel, itemTypeOptions } from "@/lib/itemTypeFilters";

export type ClearingAdminTab = "drops" | "enemies" | "special-mobs" | "shop";
export type ClearingConfig = {
  drops: any[];
  enemies: any[];
  specialMobs: any[];
  missingEnemies: boolean;
  hasBossWithoutRare: boolean;
};

type Request = { method: string; url: string; body?: unknown; success: string };
type Act = (request: Request) => void;

const card =
  "rounded-xl border border-amber-700/35 bg-gradient-to-b from-[#332516]/90 to-[#17120c]/90 p-3 shadow-md";
const button =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-700 px-3 py-2 text-sm font-black text-amber-50 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50";
const iconButton = `${button} w-11 shrink-0 px-0`;
const field =
  "min-h-11 w-full rounded-lg border border-amber-700/40 bg-black/35 px-3 text-amber-50 outline-none focus:border-amber-400";
const inlineSelect =
  "min-h-11 rounded-lg border border-amber-700/40 bg-black/40 px-2 text-sm text-amber-50 outline-none focus:border-amber-400";

export function ClearingAdminHeader({
  worlds,
  selected,
  selectedName,
  onWorld,
  config,
  shop,
}: {
  worlds: { id: string; name: string }[];
  selected: string;
  selectedName: string;
  onWorld: (id: string) => void;
  config?: ClearingConfig;
  shop?: any;
}) {
  const badges = [
    shop?.enabled ? "Portal enabled" : "Portal disabled",
    `${config?.drops.length ?? 0} drops`,
    `${config?.enemies.length ?? 0} enemies`,
    `${config?.specialMobs.length ?? 0} special mobs`,
    `${shop?.items?.length ?? 0} shop items`,
  ];

  return (
    <header className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">
            Elysian Clearing
          </p>
          <h2 className="mt-0.5 font-fantasy text-xl font-black leading-tight text-amber-100 sm:text-2xl">
            Clearing Administration
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-stone-300 sm:text-sm">
            Manage rewards, encounters, special pets, and the Essence shop portal.
          </p>
        </div>

        <label className="w-full text-xs font-bold text-amber-200 sm:w-64">
          World
          <select
            aria-label="Clearing world"
            className={`${field} mt-1`}
            value={selected}
            onChange={(event) => onWorld(event.target.value)}
          >
            {worlds.map((world) => (
              <option key={world.id} value={world.id}>
                {world.name}
              </option>
            ))}
          </select>
          <span className="sr-only">Selected world: {selectedName}</span>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-amber-800/30 pt-2">
        {badges.map((badge, index) => (
          <span
            key={badge}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold leading-5 ${
              index === 0 && shop?.enabled
                ? "border-emerald-500/60 bg-emerald-950 text-emerald-200"
                : "border-amber-700/50 bg-black/25 text-amber-100"
            }`}
          >
            {badge}
          </span>
        ))}
      </div>
    </header>
  );
}

export function ClearingAdminTabs({
  active,
  onChange,
}: {
  active: ClearingAdminTab;
  onChange: (tab: ClearingAdminTab) => void;
}) {
  const tabs: { id: ClearingAdminTab; label: string; mobileLabel?: string }[] = [
    { id: "drops", label: "Drops" },
    { id: "enemies", label: "Enemies" },
    { id: "special-mobs", label: "Special Mobs", mobileLabel: "Special" },
    { id: "shop", label: "Shop" },
  ];

  return (
    <nav
      aria-label="Clearing administration sections"
      className="rounded-xl border border-amber-800/35 bg-black/25 p-1"
    >
      <div className="grid grid-cols-4 gap-1">
        {tabs.map(({ id, label, mobileLabel }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active === id ? "page" : undefined}
            aria-label={label}
            className={`min-h-10 min-w-0 rounded-lg px-1 text-[11px] font-black leading-tight transition sm:px-3 sm:text-sm ${
              active === id
                ? "bg-gradient-to-b from-amber-600 to-amber-800 text-white shadow"
                : "text-amber-200 hover:bg-amber-950/50"
            }`}
          >
            {mobileLabel ? (
              <>
                <span className="sm:hidden">{mobileLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </>
            ) : (
              label
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function ClearingAssignmentCard({
  image,
  name,
  details,
  actions,
}: {
  image?: string | null;
  name: string;
  details: ReactNode;
  actions: ReactNode;
}) {
  return (
    <article className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-amber-800/35 bg-black/25 p-2.5 lg:grid-cols-[3.5rem_minmax(0,1fr)_auto] lg:items-center">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-black/20 lg:h-14 lg:w-14">
        <img src={image || ""} alt="" className="max-h-full max-w-full object-contain" />
      </div>

      <div className="min-w-0 self-center">
        <h4 className="break-words text-sm font-black leading-tight text-amber-100 sm:text-base">
          {name}
        </h4>
        <div className="mt-0.5 text-xs leading-5 text-stone-300">{details}</div>
      </div>

      <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-amber-800/25 pt-2 lg:col-span-1 lg:border-0 lg:pt-0">
        {actions}
      </div>
    </article>
  );
}

export function ClearingAddItemModal({
  title,
  searchLabel,
  items,
  onClose,
  render,
}: {
  title: string;
  searchLabel: string;
  items: any[];
  onClose: () => void;
  render: (item: any) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const types = useMemo(() => itemTypeOptions(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (type === "all" || (item.type || "item") === type) &&
          item.name?.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [items, search, type],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85dvh] w-full max-w-2xl overflow-hidden rounded-2xl border border-amber-500/60 bg-[#21170e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-amber-800/40 px-3 py-2.5 sm:p-4">
          <h3 className="font-fantasy text-lg font-black text-amber-100 sm:text-xl">
            {title}
          </h3>
          <button
            type="button"
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-white/10"
            onClick={onClose}
          >
            <X />
          </button>
        </div>

        <div className="p-3 sm:p-4">
          <label className="text-sm font-bold text-amber-200">
            {searchLabel}
            <span className="relative mt-1 block">
              <Search className="absolute left-3 top-3 h-5 w-5 text-stone-400" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${field} pl-10`}
              />
            </span>
          </label>

          {types.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Filter catalog by item type">
              <button
                type="button"
                aria-pressed={type === "all"}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${
                  type === "all"
                    ? "border-amber-300 bg-amber-700 text-white shadow-[0_0_12px_rgba(251,191,36,.25)]"
                    : "border-amber-800/60 bg-black/30 text-amber-200"
                }`}
                onClick={() => setType("all")}
              >
                All Types
              </button>
              {types.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  className={`shrink-0 rounded-full border px-3 py-2 text-xs font-black ${
                    type === value
                      ? "border-amber-300 bg-amber-700 text-white shadow-[0_0_12px_rgba(251,191,36,.25)]"
                      : "border-amber-800/60 bg-black/30 text-amber-200"
                  }`}
                  onClick={() => setType(value)}
                >
                  {itemTypeLabel(value)}
                </button>
              ))}
            </div>
          )}

          <p className="mt-1.5 text-xs text-stone-400">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
            {type !== "all" ? ` · ${itemTypeLabel(type)}` : ""}
          </p>

          <div className="mt-2 max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
            {filtered.map(render)}
            {filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-amber-700/40 p-8 text-center text-stone-400">
                No matching items found.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const confirmRemove = (name: string, run: () => void) => {
  if (window.confirm(`Remove ${name} from this Clearing?`)) run();
};

export function ClearingDropsAdmin({
  worldId,
  config,
  catalog,
  busy,
  act,
}: {
  worldId: string;
  config: ClearingConfig;
  catalog: any[];
  busy: boolean;
  act: Act;
}) {
  const [open, setOpen] = useState(false);
  const assigned = new Set(config.drops.map((item) => item.shop_item_id));
  const available = catalog.filter((item) => !assigned.has(item.id));

  return (
    <section className={card}>
      <AdminListHeader
        title="Assigned Drops"
        count={config.drops.length}
        addLabel="Add Drop"
        onAdd={() => setOpen(true)}
      />

      <p className="mb-2 mt-2 rounded-lg bg-amber-950/45 px-2.5 py-2 text-xs leading-5 text-amber-200">
        Items with 3 stars or higher are automatically forced to an effective <strong>Rare</strong> Clearing rarity.
      </p>

      <div className="space-y-2">
        {config.drops.map((drop) => (
          <ClearingAssignmentCard
            key={drop.id}
            image={drop.image_url}
            name={drop.name}
            details={
              <>
                <span>
                  {drop.type} · {drop.item_world_id || "No original world"} · {drop.star_rarity ?? 0}★
                </span>
                <br />
                <strong className="capitalize text-amber-300">
                  Effective: {drop.effective_rarity}
                </strong>
              </>
            }
            actions={
              <>
                <label className="flex min-w-0 flex-1 items-center justify-between gap-2 text-xs font-bold sm:flex-none">
                  <span>Rarity</span>
                  <select
                    aria-label={`${drop.name} Clearing rarity`}
                    className={`${inlineSelect} min-w-[7rem]`}
                    value={drop.effective_rarity}
                    disabled={busy || Number(drop.star_rarity) >= 3}
                    onChange={(event) =>
                      act({
                        method: "PATCH",
                        url: `/api/admin/clearing/drops/${drop.id}`,
                        body: { rarity: event.target.value },
                        success: `${drop.name} rarity updated.`,
                      })
                    }
                  >
                    {["common", "uncommon", "rare"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`${iconButton} border-red-500/50 bg-red-950`}
                  disabled={busy}
                  onClick={() =>
                    confirmRemove(drop.name, () =>
                      act({
                        method: "DELETE",
                        url: `/api/admin/clearing/drops/${drop.id}`,
                        success: `${drop.name} removed.`,
                      }),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove {drop.name}</span>
                </button>
              </>
            }
          />
        ))}
        {!config.drops.length && <Empty text="No drops are assigned to this world." />}
      </div>

      {open && (
        <ClearingAddItemModal
          title="Add a Drop"
          searchLabel="Search catalog by name"
          items={available}
          onClose={() => setOpen(false)}
          render={(item) => (
            <Picker
              key={item.id}
              item={item}
              detail={`${item.type} · ${item.worldId || "No world"} · ${item.starRarity ?? 0}★`}
              disabled={busy}
              label="Add"
              onClick={() =>
                act({
                  method: "POST",
                  url: `/api/admin/clearing/worlds/${worldId}/drops`,
                  body: {
                    shopItemId: item.id,
                    rarity: Number(item.starRarity) >= 3 ? "rare" : "common",
                  },
                  success: `${item.name} added as a drop.`,
                })
              }
            />
          )}
        />
      )}
    </section>
  );
}

export function ClearingEnemiesAdmin({
  worldId,
  config,
  catalog,
  busy,
  act,
}: {
  worldId: string;
  config: ClearingConfig;
  catalog: any[];
  busy: boolean;
  act: Act;
}) {
  const [open, setOpen] = useState(false);
  const assigned = new Set(config.enemies.map((item) => item.enemy_id));
  const available = catalog.filter((item) => !assigned.has(item.id));
  const hasRare = config.drops.some((drop) => drop.effective_rarity === "rare");

  return (
    <AdminList
      title="Assigned Enemies"
      count={config.enemies.length}
      addLabel="Add Enemy"
      onAdd={() => setOpen(true)}
      empty="No enemies are assigned."
    >
      {config.enemies.map((enemy) => (
        <ClearingAssignmentCard
          key={enemy.id}
          image={enemy.image_url}
          name={enemy.name}
          details={enemy.is_boss ? "Boss encounter" : "Regular encounter"}
          actions={
            <>
              <label className="flex min-w-0 flex-1 items-center justify-between gap-2 text-xs font-bold sm:flex-none">
                <span>Encounter</span>
                <select
                  aria-label={`${enemy.name} encounter status`}
                  className={`${inlineSelect} min-w-[7rem]`}
                  value={enemy.is_boss ? "boss" : "regular"}
                  disabled={busy}
                  onChange={(event) =>
                    act({
                      method: "PATCH",
                      url: `/api/admin/clearing/enemies/${enemy.id}`,
                      body: { isBoss: event.target.value === "boss" },
                      success: `${enemy.name} updated.`,
                    })
                  }
                >
                  <option value="regular">Regular</option>
                  <option value="boss" disabled={!hasRare}>
                    Boss
                  </option>
                </select>
              </label>
              <button
                type="button"
                className={`${iconButton} border-red-500/50 bg-red-950`}
                disabled={busy}
                onClick={() =>
                  confirmRemove(enemy.name, () =>
                    act({
                      method: "DELETE",
                      url: `/api/admin/clearing/enemies/${enemy.id}`,
                      success: `${enemy.name} removed.`,
                    }),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Remove {enemy.name}</span>
              </button>
            </>
          }
        />
      ))}

      {!hasRare && (
        <p className="rounded-lg border border-amber-600/50 bg-amber-950/40 p-2.5 text-xs leading-5 text-amber-100">
          Configure an effective Rare drop before enabling a boss.
        </p>
      )}

      {open && (
        <ClearingAddItemModal
          title="Add Enemy"
          searchLabel="Search enemies by name"
          items={available}
          onClose={() => setOpen(false)}
          render={(enemy) => (
            <Picker
              key={enemy.id}
              item={enemy}
              detail="Added as a Regular enemy"
              disabled={busy}
              label="Add"
              onClick={() =>
                act({
                  method: "POST",
                  url: `/api/admin/clearing/worlds/${worldId}/enemies`,
                  body: { enemyId: enemy.id, isBoss: false },
                  success: `${enemy.name} added.`,
                })
              }
            />
          )}
        />
      )}
    </AdminList>
  );
}

export function ClearingSpecialMobsAdmin({
  worldId,
  config,
  catalog,
  busy,
  act,
}: {
  worldId: string;
  config: ClearingConfig;
  catalog: any[];
  busy: boolean;
  act: Act;
}) {
  const [open, setOpen] = useState(false);
  const assigned = new Set(config.specialMobs.map((item) => item.pet_shop_item_id));
  const available = catalog.filter((item) => item.type === "pet" && !assigned.has(item.id));

  return (
    <AdminList
      title="Assigned Special Mobs"
      count={config.specialMobs.length}
      addLabel="Add Special Mob"
      onAdd={() => setOpen(true)}
      empty="No special mobs are assigned."
    >
      {config.specialMobs.map((pet) => (
        <ClearingAssignmentCard
          key={pet.id}
          image={pet.hatched_image_url || pet.image_url || pet.egg_image_url}
          name={pet.name}
          details={`${Math.max(1, Number(pet.rarity || pet.star_rarity || 1))}★ rarity`}
          actions={
            <button
              type="button"
              className={`${iconButton} border-red-500/50 bg-red-950`}
              disabled={busy}
              onClick={() =>
                confirmRemove(pet.name, () =>
                  act({
                    method: "DELETE",
                    url: `/api/admin/clearing/special-mobs/${pet.id}`,
                    success: `${pet.name} removed.`,
                  }),
                )
              }
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove {pet.name}</span>
            </button>
          }
        />
      ))}

      <p className="text-xs leading-5 text-amber-100/75">
        Special mobs retain their rare appearance and guaranteed egg-drop behavior.
      </p>

      {open && (
        <ClearingAddItemModal
          title="Add Special Mob"
          searchLabel="Search pets by name"
          items={available}
          onClose={() => setOpen(false)}
          render={(pet) => (
            <Picker
              key={pet.id}
              item={{
                ...pet,
                imageUrl: pet.hatchedImageUrl || pet.imageUrl || pet.eggImageUrl,
              }}
              detail={`${Math.max(1, Number(pet.rarity || pet.starRarity || 1))}★ rarity`}
              disabled={busy}
              label="Add"
              onClick={() =>
                act({
                  method: "POST",
                  url: `/api/admin/clearing/worlds/${worldId}/special-mobs`,
                  body: { petShopItemId: pet.id },
                  success: `${pet.name} added.`,
                })
              }
            />
          )}
        />
      )}
    </AdminList>
  );
}

function AdminList({
  title,
  count,
  addLabel,
  onAdd,
  empty,
  children,
}: {
  title: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className={card}>
      <AdminListHeader title={title} count={count} addLabel={addLabel} onAdd={onAdd} />
      <div className="mt-2 space-y-2">
        {count ? children : (
          <>
            <Empty text={empty} />
            {children}
          </>
        )}
      </div>
    </section>
  );
}

function AdminListHeader({
  title,
  count,
  addLabel,
  onAdd,
}: {
  title: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h3 className="truncate text-base font-black text-amber-100 sm:text-lg">{title}</h3>
        <p className="text-xs text-stone-400">{count} configured</p>
      </div>
      <button type="button" className={`${button} shrink-0`} onClick={onAdd}>
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{addLabel}</span>
        <span className="sm:hidden">Add</span>
      </button>
    </div>
  );
}

function Picker({
  item,
  detail,
  disabled,
  label,
  onClick,
}: {
  item: any;
  detail: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-amber-800/35 bg-black/25 p-2.5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/20">
        <img src={item.imageUrl || ""} alt="" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-amber-100">{item.name}</strong>
        <p className="truncate text-xs text-stone-400">{detail}</p>
      </div>
      <button type="button" className={`${button} shrink-0`} disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-amber-700/40 p-5 text-center text-sm text-stone-400">
      {text}
    </p>
  );
}
