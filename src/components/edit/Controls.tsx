"use client";

import { useState, type FormEvent } from "react";
import type { OpenQuestion } from "@/data/types";
import { useEditor } from "./EditorProvider";
import { field, primaryBtn, secondaryBtn } from "./SegmentDialog";

/** A to-do with a tick box that completes it. The whole 44px box is the target. */
export function TodoItem({ target, text }: { target: string; text: string }) {
  const { submit, busy } = useEditor();
  return (
    <li className="flex items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => submit([{ op: "complete_todo", target, text }])}
        aria-label={`Done: ${text}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-sunken disabled:opacity-50"
      >
        <span aria-hidden="true" className="size-6 rounded-md border-2 border-ink" />
      </button>
      <span className="text-base">{text}</span>
    </li>
  );
}

export function AddTodo({ target }: { target: string }) {
  const { submit, busy } = useEditor();
  const [text, setText] = useState("");
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim() && (await submit([{ op: "add_todo", target, text: text.trim() }]))) setText("");
  }
  return (
    <form onSubmit={onSubmit} className="mt-3 flex items-end gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a to-do"
        maxLength={300}
        aria-label="New to-do"
        className={`${field} mt-0 min-w-0 flex-1`}
      />
      <button disabled={busy || !text.trim()} className={secondaryBtn}>
        Add
      </button>
    </form>
  );
}

/** Record a decision for an open question, or reopen a decided one. */
export function QuestionControls({ question }: { question: OpenQuestion }) {
  const { submit, busy } = useEditor();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");

  if (question.answer) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => submit([{ op: "resolve_question", id: question.id, answer: null }])}
        className={`${secondaryBtn} mt-2`}
      >
        Reopen
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${secondaryBtn} mt-3`}>
        Record the decision
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (answer.trim() && (await submit([{ op: "resolve_question", id: question.id, answer: answer.trim() }]))) setOpen(false);
      }}
      className="mt-3 flex items-end gap-2"
    >
      <input
        autoFocus
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="What did we decide?"
        maxLength={500}
        aria-label="Decision"
        className={`${field} mt-0 min-w-0 flex-1`}
      />
      <button disabled={busy || !answer.trim()} className={primaryBtn}>
        Save
      </button>
    </form>
  );
}
