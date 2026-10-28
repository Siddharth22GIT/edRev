/** Profile photo with an initials fallback. `ring` adds the brand orange gradient ring used on profile headers. */
export function Avatar({
  name,
  photoUrl,
  initials,
  size = 36,
  ring = false,
  className = "",
}: {
  name: string;
  photoUrl?: string;
  initials?: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const letters =
    initials ||
    name
      .split(/\s+/)
      .filter((part) => !/^(dr|prof|mr|mrs|ms)\.?$/i.test(part))
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const inner = photoUrl ? (
    // Data-URL photos: next/image adds nothing here
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={name} className="h-full w-full rounded-full object-cover" src={photoUrl} />
  ) : (
    <span
      className="grid h-full w-full place-items-center rounded-full bg-[#FEF6EE] font-black text-[#C27803]"
      style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {letters}
    </span>
  );

  if (!ring) {
    return (
      <span className={`inline-block shrink-0 overflow-hidden rounded-full ring-2 ring-[#FBD7B3] ${className}`} style={{ width: size, height: size }}>
        {inner}
      </span>
    );
  }

  return (
    <span
      className={`inline-block shrink-0 rounded-full bg-gradient-to-br from-[#F7BC80] via-[#F2A65A] to-[#3978B8] p-[4px] shadow-lg ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="block h-full w-full rounded-full bg-white p-[3px]">{inner}</span>
    </span>
  );
}
