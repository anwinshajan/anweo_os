"use client";
// A small "Delete" button that asks for confirmation before the surrounding form is submitted.
export default function DeleteButton({ message, label = "Delete" }: { message: string; label?: string }) {
  return (
    <button type="submit" onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }} className="text-xs font-medium text-red-700 hover:underline">{label}</button>
  );
}
