import Link from "next/link";
import Image from "next/image";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/brand";

export function Brand({ tagline = false, linked = true }: { tagline?: boolean; linked?: boolean }) {
  const identity = <><LogoMark />{PRODUCT_NAME}{tagline && <span className="wordmark-note">{PRODUCT_TAGLINE}</span>}</>;
  return linked ? <Link href="/?all=1" prefetch={false} className="wordmark shrink-0" aria-label="Voyroo home">{identity}</Link> : <span className="wordmark shrink-0">{identity}</span>;
}

export function LogoMark() {
  return <span className="brand-mark" aria-hidden="true"><Image src="/brand/voyroo-mark.svg" width={64} height={64} alt="" className="size-full" /></span>;
}
