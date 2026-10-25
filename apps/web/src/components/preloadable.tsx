import { lazy, useState, type ComponentType } from "react";

/**
 * A component whose code loads on its own, like `React.lazy`, plus a
 * `preload` to fetch it ahead of time. Once the code is in, the component
 * renders directly. `React.lazy` suspends on its first render even when the
 * code has already arrived, and React holds a revealed Suspense boundary for
 * about 300ms, so opening a thread or the settings would wait that long.
 */
export function preloadable<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () => {
    pending ??= load().then((component) => (loaded = component));
    return pending;
  };
  const Lazy = lazy(() => preload().then((component) => ({ default: component })));

  function Preloadable(props: P) {
    // Chosen once per mount: switching from the lazy wrapper to the loaded
    // component later would remount it and lose its state.
    const [Component] = useState<ComponentType<P>>(() => loaded ?? Lazy);
    return <Component {...props} />;
  }

  return { Component: Preloadable, preload };
}
