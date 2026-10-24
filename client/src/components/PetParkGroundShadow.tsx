/** Soft sprite contact shadow positioned inside the already placed artwork box. */
export default function PetParkGroundShadow({ kind }: { kind: "pet" | "building" | "decor" }) {
  const isPet = kind === "pet";
  return <span aria-hidden="true"
    className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full ${isPet ? "top-[74%]" : "bottom-[1%]"}`}
    style={{
      width: isPet ? "58%" : kind === "building" ? "64%" : "56%",
      height: isPet ? "11%" : "12%",
      background: "radial-gradient(ellipse, rgba(13,29,17,.45) 0%, rgba(15,34,19,.22) 52%, rgba(15,34,19,0) 78%)",
      filter: "blur(2px)",
    }} />;
}
