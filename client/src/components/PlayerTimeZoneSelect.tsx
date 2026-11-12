import { useMemo } from "react";
import { detectedPlayerTimeZone } from "@shared/playerTimeZone";

type Props = {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  testId?: string;
};

const fallback = [
  "UTC", "Pacific/Honolulu", "America/Anchorage",
  "America/Los_Angeles", "America/Denver", "America/Chicago",
  "America/New_York", "America/Phoenix", "America/Toronto",
  "America/Mexico_City", "America/Sao_Paulo", "Europe/London",
  "Europe/Paris", "Europe/Berlin", "Europe/Athens", "Africa/Johannesburg",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Singapore",
  "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

/** Native selection works with iOS/Android touch controls, while IANA zone
 * identifiers correctly follow daylight-saving changes. */
export default function PlayerTimeZoneSelect({ id, value, onChange, disabled, testId }: Props) {
  const choices = useMemo(() => {
    const provider = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    const available = provider.supportedValuesOf?.("timeZone") ?? fallback;
    return [...new Set(["UTC", detectedPlayerTimeZone(), value, ...available])]
      .filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [value]);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-fantasy text-xs tracking-wider text-[#ebd397]">
        Your Time Zone
      </label>
      <select id={id} data-testid={testId} value={value} disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="w-full min-h-11 rounded-lg border border-[#bb995b] bg-[#173a27] px-3 py-2 text-sm text-[#f8e7ba] outline-none focus-visible:ring-2 focus-visible:ring-[#e9cb85] disabled:opacity-60">
        {choices.map(zone => <option key={zone} value={zone}>
          {zone === "UTC" ? "UTC" : zone.replaceAll("_", " ").replaceAll("/", " / ")}
        </option>)}
      </select>
    </div>
  );
}
