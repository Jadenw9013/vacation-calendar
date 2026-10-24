"use client";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";

export function PrintTrip() {
  return <button type="button" className={btn.secondary} onClick={() => window.print()}><Icon name="plan" />Print itinerary</button>;
}
