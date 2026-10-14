"use client";

import { useState, type ReactNode } from "react";
import { useEditor } from "@/components/edit/EditorProvider";
import { field, secondaryBtn } from "@/components/edit/SegmentDialog";

export const FIRST_NAME = /^\p{L}[\p{L}'-]{0,29}$/u;

/**
 * Asks for a first name in place, inside whatever sheet is open, instead of
 * stacking the name picker on top. Shows `children` once there is a name.
 */
export function NameGate({
  children,
  why = "Your first name goes on the change.",
  onSaved,
}: {
  children: ReactNode;
  why?: string;
  onSaved?: (name: string) => void;
}) {
  const { author, setAuthor } = useEditor();
  const [name, setName] = useState("");
  const [bad, setBad] = useState(false);
  if (author) return <>{children}</>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!FIRST_NAME.test(n)) return setBad(true);
        setAuthor(n);
        onSaved?.(n);
      }}
      className={`flex flex-col gap-2 rounded-2xl border-2 p-3 transition-colors ${
        bad ? "border-action bg-action-soft/20" : "border-line bg-surface"
      }`}
    >
      <label className="text-base font-semibold" htmlFor="name-gate">
        Who&apos;s this? <span className="font-normal text-muted">{why}</span>
      </label>
      <div className="flex gap-2">
        <input
          id="name-gate"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (bad) setBad(false);
          }}
          autoComplete="given-name"
          maxLength={30}
          placeholder="First name (e.g. Jaden)"
          className={`${field} mt-0 min-w-0 flex-1 ${bad ? "border-action focus:ring-action" : ""}`}
        />
        <button type="submit" className={secondaryBtn}>Save</button>
      </div>
      {bad && <p className="text-sm font-semibold text-action">One word, letters only. First name.</p>}
    </form>
  );
}
