"use client";

import { useState, type FormEvent } from "react";
import type { OpenQuestion } from "@/data/types";
import { useEditor } from "./EditorProvider";

/** A to-do with a tick box that completes it. */
export function TodoItem({ target, text }: { target: string; text: string }) {
  const { submit, busy } = useEditor();
  return (
    <li className="flex gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => submit([{ op: "complete_todo", target, text }])}
        aria-label={`Done: ${text}`}
        className="mt-0.5 size-4 shrink-0 border border-basalt hover:bg-lake disabled:opacity-50"
      />
      <span>{text}</span>
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
    <form onSubmit={onSubmit} className="mt-2 flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a to-do"
        maxLength={300}
        aria-label="New to-do"
        className="min-w-0 flex-1 border border-scree bg-card px-2 py-1 text-sm"
      />
      <button disabled={busy || !text.trim()} className="border border-basalt px-3 text-sm font-semibold disabled:opacity-40">
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
        className="mt-2 text-xs font-semibold text-pumice underline underline-offset-2"
      >
        Reopen
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-semibold underline underline-offset-2">
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
      className="mt-2 flex gap-2"
    >
      <input
        autoFocus
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="What did we decide?"
        maxLength={500}
        aria-label="Decision"
        className="min-w-0 flex-1 border border-basalt bg-card px-2 py-1 text-sm"
      />
      <button disabled={busy || !answer.trim()} className="bg-basalt px-3 text-sm font-bold text-ash disabled:opacity-40">
        Save
      </button>
    </form>
  );
}
