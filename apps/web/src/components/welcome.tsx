import { GitHubMark } from "./github-mark";
import { OpenRouterIcon } from "./provider-icon";
import { providers } from "./providers";
import { Spinner } from "./spinner";

/** Public welcome. Desktop and the narrow layout are both in the tree; CSS picks one. */
export function Welcome({
  waiting,
  onContinue,
  onOpenAgain,
}: {
  waiting?: boolean;
  onContinue: () => void;
  onOpenAgain?: () => void;
}) {
  if (waiting) return <GitHubWait onOpenAgain={onOpenAgain ?? onContinue} />;
  return (
    <main className="flex h-svh flex-col bg-white md:flex-row">
      <img
        src="/welcome-landscape.jpg"
        alt=""
        className="h-64 w-full shrink-0 object-cover md:h-full md:w-[560px]"
      />
      <div className="flex flex-1 flex-col justify-center px-8 py-10 md:items-start md:px-16">
        <h1 className="max-w-[520px] text-[40px] leading-[46px] font-semibold tracking-[-0.03em] text-[#1C1C1E] md:text-[44px] md:leading-[50px]">
          Know or learn anything, or everything.
        </h1>
        <p className="mt-4 max-w-[460px] text-base leading-6 text-[#6E6E73] md:hidden">
          Bring the models you already use into one calm place to chat.
        </p>
        <p className="mt-3.5 hidden max-w-[460px] text-base leading-6 text-[#6E6E73] md:block">
          Every model you already use, in one calm place.
        </p>
        <ul className="mt-10 hidden w-[520px] gap-7 md:flex">
          {providers.map(({ slug, name, Icon }) => (
            <li key={slug} className="flex flex-col items-center gap-2">
              {slug === "openrouter" ? (
                <span className="flex size-8 items-center justify-center rounded-xl bg-[#111111]">
                  <OpenRouterIcon size={20} />
                </span>
              ) : (
                <Icon size={32} className="text-[#1C1C1E]" />
              )}
              <span className="text-[13px] text-[#6E6E73]">{name}</span>
            </li>
          ))}
          <li className="flex flex-col items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#F7F7F9] text-sm tracking-[0.2em] text-[#6E6E73]">
              ···
            </span>
            <span className="text-[13px] text-[#6E6E73]">more</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={onContinue}
          className="mt-8 flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#1C1C1E] px-5 text-sm font-medium text-white md:mt-9 md:h-11 md:w-auto"
        >
          <GitHubMark size={16} />
          Continue with GitHub
        </button>
      </div>
    </main>
  );
}

/** Shown from the moment GitHub sign-in starts until the browser comes back. */
export function GitHubWait({ onOpenAgain }: { onOpenAgain: () => void }) {
  return (
    <main className="flex h-svh flex-col items-center justify-center bg-white px-8 text-center">
      <span className="relative flex size-16 items-center justify-center">
        <Spinner size={64} />
        <span className="absolute flex size-10 items-center justify-center rounded-full bg-white">
          <GitHubMark size={22} fill="#1C1C1E" />
        </span>
      </span>
      <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
        Waiting for GitHub
      </h1>
      <p className="mt-2 max-w-[280px] text-[15px] leading-6 text-[#6E6E73]">
        We opened your browser to finish signing in. This screen updates on its own when you come
        back.
      </p>
      <button
        type="button"
        onClick={onOpenAgain}
        className="mt-6 h-11 rounded-full border border-[#DCDCE0] px-5 text-sm font-medium text-[#1C1C1E]"
      >
        Open browser again
      </button>
    </main>
  );
}
