import { OpenRouterIcon } from "./provider-icon";
import { findProvider } from "./providers";

// models.dev serves a mark for every provider it lists.
export function modelsDevLogo(id: string) {
  return `https://models.dev/logos/${encodeURIComponent(id)}.svg`;
}

/** The brand mark of a models.dev provider. Hidden if the logo is missing. */
export function ModelsDevMark({ id, size = 24 }: { id: string; size?: number }) {
  return (
    <img
      src={modelsDevLogo(id)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
      className="shrink-0 object-contain"
    />
  );
}

/**
 * The mark for a connection. The four named providers use their lobe-icons
 * marks; a custom connection is labelled with its models.dev provider id.
 */
export function ConnectionMark({
  type,
  label,
  size = 24,
}: {
  type: string;
  label?: string;
  size?: number;
}) {
  if (type === "custom") return label ? <ModelsDevMark id={label} size={size} /> : null;
  const provider = findProvider(type);
  if (!provider) return null;
  const { Icon } = provider;
  if (type === "openrouter") {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-[22%] bg-[#111111]"
        style={{ width: size, height: size }}
      >
        <OpenRouterIcon size={size * 0.7} />
      </span>
    );
  }
  return <Icon size={size} className="shrink-0 text-ink" />;
}
