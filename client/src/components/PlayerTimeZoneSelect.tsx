import { isValidPlayerTimeZone } from "@shared/playerTimeZone";

type Props = {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  testId?: string;
};

// Short player-facing list, focused on major time zones. Existing custom
// selections remain available so returning players are never silently moved.
const majorZones = [
  ["UTC", "UTC"],
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Anchorage", "Alaska"],
  ["America/Los_Angeles", "Pacific (US)"],
  ["America/Denver", "Mountain (US)"],
  ["America/Phoenix", "Arizona (US)"],
  ["America/Chicago", "Central (US)"],
  ["America/New_York", "Eastern (US)"],
  ["Europe/London", "London"],
  ["Europe/Paris", "Central Europe"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Kolkata", "India"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"],
  ["Pacific/Auckland", "New Zealand"],
] as const;

/** Native selection works with iOS/Android touch controls, while IANA zone
 * identifiers correctly follow daylight-saving changes. */
export default function PlayerTimeZoneSelect({ id, value, onChange, disabled, testId }: Props) {
  const choices: ReadonlyArray<readonly [string, string]> = majorZones.some(([zone]) => zone === value) ||
      !isValidPlayerTimeZone(value)
    ? majorZones
    : [...majorZones, [value, value.replaceAll("_", " ").replaceAll("/", " / ") + " (saved)"]];

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-fantasy text-xs tracking-wider text-[#ebd397]">
        Your Time Zone
      </label>
      <select id={id} data-testid={testId} value={value} disabled={disabled}
        onChange={event => onChange(event.target.value)}
        className="w-full min-h-11 rounded-lg border border-[#bb995b] bg-[#173a27] px-3 py-2 text-sm text-[#f8e7ba] outline-none focus-visible:ring-2 focus-visible:ring-[#e9cb85] disabled:opacity-60">
        {choices.map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
      </select>
    </div>
  );
}
