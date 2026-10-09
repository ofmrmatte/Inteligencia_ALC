import {
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ImgHTMLAttributes,
} from "react";
export function usePathname() {
  return useSyncExternalStore(
    (listen) => {
      addEventListener("popstate", listen);
      return () => removeEventListener("popstate", listen);
    },
    () => location.pathname,
    () => "/gestao/atendentes",
  );
}
export default function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!props.target && href.startsWith("/")) {
          event.preventDefault();
          history.pushState(null, "", href);
          dispatchEvent(new PopStateEvent("popstate"));
        }
      }}
    />
  );
}
export function Image({
  priority,
  alt = "",
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  // Browser-only fixture keeps Next images visible without an image optimizer.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={alt} loading={priority ? "eager" : props.loading} />
  );
}
