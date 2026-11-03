"use client";
import { useEffect, useState } from "react";

// Shows a time in the viewer's own time zone (India and UK teams see their own clocks). Renders after load to avoid mismatches.
export default function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "datetime" | "time" | "date" }) {
  const [t, setT] = useState("");
  useEffect(() => {
    const d = new Date(iso);
    setT(mode === "time" ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : mode === "date" ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  }, [iso, mode]);
  return <span suppressHydrationWarning>{t || " "}</span>;
}
