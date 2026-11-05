/** Only pets cast an ambient ground shadow; buildings and decor use their artwork. */
export default function PetParkGroundShadow({ kind }: { kind: "pet" | "building" | "decor" }) {
  if (kind !== "pet") return null;
  return <span aria-hidden="true" data-testid="pet-park-contact-shadow"
    className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full top-[74%]"
    style={{
      width: "58%",
      height: "11%",
      background: "radial-gradient(ellipse, rgba(13,29,17,.45) 0%, rgba(15,34,19,.22) 52%, rgba(15,34,19,0) 78%)",
      filter: "blur(2px)",
    }} />;
}
