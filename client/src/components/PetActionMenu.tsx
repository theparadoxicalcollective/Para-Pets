import { useEffect, useRef } from "react";
import ViewportModalPortal from "@/components/ViewportModalPortal";
import type { PetAction } from "@/lib/petActionRoutes";
import {
  PET_MENU_ACTIONS,
  PET_MENU_BUTTON_SIZE,
  PET_MENU_HEIGHT,
  PET_MENU_WIDTH,
  petMenuBubbleLeft,
  positionPetActionMenu,
} from "@/lib/petActionMenuGeometry";
import petCareIconImg from "@assets/uploads/NewPetCareButton.PNG?url";
import levelUpIconImg from "@assets/uploads/NewLevelUpButton.PNG?url";
import powerUpIconImg from "@assets/uploads/NewPowerUpButton.PNG?url";
import closetIconImg from "@assets/uploads/NewClosetBotton.PNG?url";
import "./PetActionMenu.css";

const ACTION_IMAGES: Record<PetAction, string> = {
  care: petCareIconImg,
  levelUp: levelUpIconImg,
  powerUp: powerUpIconImg,
  closet: closetIconImg,
};

interface PetActionMenuProps {
  petInventoryId: string;
  petName: string;
  anchor: HTMLButtonElement;
  onSelect: (action: PetAction, inventoryId: string) => void;
  onClose: () => void;
  /** Keep the four tools physically attached to the featured pet card. */
  inline?: boolean;
}

/**
 * The action bubbles are rendered on the existing viewport modal host to avoid
 * clipping within scrolling inventory cards. Only the 48px bubbles are
 * clickable; outside taps, card scrolling and camera gestures pass through.
 * No changes to the gardening tool's action/state system are required.
 */
function FloatingPetActionMenu({
  petInventoryId,
  petName,
  anchor,
  onSelect,
  onClose,
}: PetActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current?.contains(event.target)) return;
      // Another pet's menu trigger changes the selection through its own
      // onClick; don't clear it in the document capture phase.
      if (event.target instanceof Element && event.target.closest("[data-pet-menu-trigger]")) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        if (anchor.isConnected) anchor.focus();
      }
    };
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.visualViewport?.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("[data-pet-action]")?.focus({ preventScroll: true });
  }, [petInventoryId]);

  const hud = document.getElementById("game-viewport-hud");
  const hudRect = hud?.getBoundingClientRect();
  const buttonRect = anchor.getBoundingClientRect();
  const viewportWidth = hud?.clientWidth || window.innerWidth;
  const viewportHeight = hud?.clientHeight || window.innerHeight;
  // The HUD can have CSS scaling on some stage-owned surfaces. Project
  // rendered screen pixels into the same HUD coordinate plane as the portal.
  const scaleX = hudRect?.width ? viewportWidth / hudRect.width : 1;
  const scaleY = hudRect?.height ? viewportHeight / hudRect.height : 1;
  const originLeft = hudRect?.left ?? 0;
  const originTop = hudRect?.top ?? 0;
  const position = positionPetActionMenu({
    centerX: ((buttonRect.left + buttonRect.right) / 2 - originLeft) * scaleX,
    top: (buttonRect.top - originTop) * scaleY,
    bottom: (buttonRect.bottom - originTop) * scaleY,
  }, { width: viewportWidth, height: viewportHeight });

  return (
    <ViewportModalPortal blocking={false}>
      <div
        ref={menuRef}
        data-testid="inventory-pet-action-menu"
        data-pet-inventory-id={petInventoryId}
        data-menu-side={position.side}
        data-menu-direction={position.direction}
        className="pointer-events-none absolute inset-0"
      >
        <div
          role="group"
          aria-label={`Pet actions for ${petName}`}
          className="pointer-events-none absolute"
          style={{
            left: position.left,
            top: position.top,
            width: PET_MENU_WIDTH,
            height: PET_MENU_HEIGHT,
          }}
        >
          {PET_MENU_ACTIONS.map(({ action, label, x, y }, index) => (
            <button
              key={action}
              type="button"
              data-pet-action={action}
              data-testid={`inventory-pet-action-${action}`}
              aria-label={`${label} for ${petName}`}
              title={label}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(action, petInventoryId);
              }}
              className="pet-action-bubble pointer-events-auto absolute flex flex-col items-center justify-start bg-transparent border-0 p-0 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d58e]"
              style={{
                left: petMenuBubbleLeft(x, position.side),
                top: y,
                width: PET_MENU_BUTTON_SIZE,
                minHeight: 62,
                animationDelay: `${index * 35}ms`,
                touchAction: "manipulation",
              }}
            >
              <img src={ACTION_IMAGES[action]} alt="" aria-hidden="true" draggable={false}
                className="w-[48px] h-[48px] object-contain drop-shadow-[0_3px_5px_#000]" />
              <span className="pet-action-bubble-label pointer-events-none whitespace-nowrap font-fantasy font-bold text-[#ffe6a4]"
                style={{ fontSize: 9, lineHeight: "12px", textShadow: "0 2px 4px #000, 0 0 7px #000" }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </ViewportModalPortal>
  );
}


/** Four existing actions in a centered, readable bloom below the Pet Menu
 * trigger. Unlike the legacy viewport popover it never drifts while scrolling
 * or overlaps other pets, and it fits the smallest supported phone. */
function InlinePetActionMenu({
  petInventoryId,
  petName,
  anchor,
  onSelect,
  onClose,
}: PetActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (menuRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest("[data-pet-menu-trigger]")) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        if (anchor.isConnected) anchor.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("[data-pet-action]")?.focus({ preventScroll: true });
  }, [petInventoryId]);

  return (
    <div
      ref={menuRef}
      data-testid="inventory-pet-action-menu"
      data-pet-inventory-id={petInventoryId}
      data-menu-layout="inline"
      role="group"
      aria-label={`Pet actions for ${petName}`}
      className="pet-action-inline-panel"
    >
      {PET_MENU_ACTIONS.map(({ action, label }, index) => (
        <button
          key={action}
          type="button"
          data-pet-action={action}
          data-testid={`inventory-pet-action-${action}`}
          aria-label={`${label} for ${petName}`}
          title={label}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(action, petInventoryId);
          }}
          className="pet-action-inline-option pet-action-bubble"
          style={{ animationDelay: `${index * 40}ms`, touchAction: "manipulation" }}
        >
          <img src={ACTION_IMAGES[action]} alt="" aria-hidden="true" draggable={false} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export default function PetActionMenu(props: PetActionMenuProps) {
  return props.inline
    ? <InlinePetActionMenu {...props} />
    : <FloatingPetActionMenu {...props} />;
}
