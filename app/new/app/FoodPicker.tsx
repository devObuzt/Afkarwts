"use client";

import { useEffect, useState } from "react";
import type { AppFood } from "@/app/lib/afkar-app/nutrition";

/** Search the library and pick one food. Drafts can't enter a template or a plan, so they aren't offered. */
export function FoodPicker({ label, onPick }: { label: string; onPick: (food: AppFood) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AppFood[]>([]);
  const [state, setState] = useState<"idle" | "error">("idle");

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/app-foods?q=${encodeURIComponent(query)}`, { signal: controller.signal }).catch(() => null);
      if (controller.signal.aborted) return;
      const body = response?.ok ? ((await response.json().catch(() => null)) as { foods: AppFood[] } | null) : null;
      if (!body) return setState("error");
      setState("idle");
      setResults(body.foods.filter((f) => f.status === "official").slice(0, 8));
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [q]);

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label className="crmField"><span>{label}</span><input onChange={(e) => setQ(e.target.value)} placeholder="اكتبي اسم الطعام" value={q} /></label>
      {state === "error" && <p className="crmRowDetail">التطبيق لا يرد الآن.</p>}
      {results.map((food) => (
        <button className="crmBtn quiet" key={food.id} onClick={() => { onPick(food); setQ(""); setResults([]); }} style={{ justifyContent: "flex-start", textAlign: "right" }} type="button">
          {food.name.ar} · سعرات لكل 100 غ: {food.per100.kcal}
        </button>
      ))}
      {q.trim().length >= 2 && results.length === 0 && state === "idle" && <p className="crmRowDetail">لا نتائج معتمدة بعد.</p>}
    </div>
  );
}
