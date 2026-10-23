import { findProvider } from "./providers";

export function ProviderMark({
  slug,
  size = 22,
  label,
}: {
  slug: string;
  size?: number;
  label?: string;
}) {
  const provider = findProvider(slug);
  if (!provider) return null;
  const { Icon } = provider;
  return (
    <span className="flex items-center gap-2.5">
      <Icon size={size} className="text-[#1C1C1E]" />
      {label !== undefined && <span className="text-sm font-medium text-[#1C1C1E]">{label}</span>}
    </span>
  );
}
