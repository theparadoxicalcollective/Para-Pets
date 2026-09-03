import { useEffect, useRef, useState } from "react";
import { readFileAsDataUrl } from "@/lib/utils";

/** Key by fitting/view/copy so a late file read cannot modify another fitting. */
export default function MirroredWingUpload({ imageUrl, disabled, onChange, onPendingChange }: {
  imageUrl?: string;
  disabled: boolean;
  onChange: (imageUrl: string | undefined) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const generation = useRef(0);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  useEffect(() => () => {
    generation.current++;
    onPendingChange(false);
  }, [onPendingChange]);

  return <div className="space-y-2 text-xs" style={{ color: "#a89878" }}>
    <label className="block">Mirrored wing image (optional)
      <input data-testid="input-mirrored-wing-image" type="file" accept="image/png" disabled={disabled || reading}
        className="block w-full mt-1 text-xs" onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError("");
          if (file.type !== "image/png" || file.size > 20 * 1024 * 1024) {
            setError("Choose a PNG image, 20MB or smaller.");
            return;
          }
          const request = ++generation.current;
          setReading(true);
          onPendingChange(true);
          try {
            const data = await readFileAsDataUrl(file);
            if (request === generation.current) onChange(data);
          } catch {
            if (request === generation.current) setError("Could not read this image. Please try again.");
          } finally {
            if (request === generation.current) {
              setReading(false);
              onPendingChange(false);
            }
          }
        }} />
    </label>
    <p className="text-[10px]">Upload the opposite-facing wing as it should appear, with the same canvas size and padding as the first wing. Without an upload, the first image is mirrored automatically. Saved with this view and copy when you press Save placement.</p>
    {reading && <p role="status">Reading image…</p>}
    {error && <p role="alert" style={{ color: "#fca5a5" }}>{error}</p>}
    {imageUrl && <div className="flex items-center gap-2">
      <img src={imageUrl} alt="Opposite wing preview" className="h-16 w-16 rounded object-contain" />
      <button type="button" disabled={disabled || reading} className="rounded p-2" style={{ background: "#382444", color: "#e7d7b5" }}
        onClick={() => onChange(undefined)}>Remove image · use automatic mirror</button>
    </div>}
  </div>;
}
