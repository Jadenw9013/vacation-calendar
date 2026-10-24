import Link from "next/link";
import { Icon } from "./Icon";

export function Brand({ tagline = false }: { tagline?: boolean }) {
  return <Link href="/?all=1" prefetch={false} className="wordmark shrink-0" aria-label="Trip home"><span className="brand-mark"><Icon name="plane" className="size-5" /></span>Trip{tagline && <span className="wordmark-note">A little further.</span>}</Link>;
}
