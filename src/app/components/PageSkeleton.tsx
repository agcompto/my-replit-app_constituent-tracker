import { useEffect, useRef } from "react";

// Inject shimmer keyframes once
function ensureShimmerStyle() {
  if (typeof document === "undefined" || document.getElementById("__shimmer__")) return;
  const s = document.createElement("style");
  s.id = "__shimmer__";
  s.textContent = `
    @keyframes __shimmer {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
  `;
  document.head.appendChild(s);
}

function Bone({ w = "100%", h = 12, style = {} }: { w?: string | number; h?: number; style?: React.CSSProperties }) {
  ensureShimmerStyle();
  const dark = document.documentElement.classList.contains("dark") ||
    document.body.closest(".dark") !== null;

  return (
    <div style={{
      width: w, height: h,
      background: dark
        ? "linear-gradient(90deg, #2a2a2a 25%, #333 50%, #2a2a2a 75%)"
        : "linear-gradient(90deg, #e8e8e8 25%, #f2f2f2 50%, #e8e8e8 75%)",
      backgroundSize: "800px 100%",
      animation: "__shimmer 1.4s infinite linear",
      ...style,
    }} />
  );
}

function ToolbarSkeleton() {
  return (
    <div style={{ padding: "14px 28px", display: "flex", gap: 12, alignItems: "center", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
      <Bone w={280} h={32} />
      <Bone w={60} h={30} />
      <Bone w={60} h={30} />
      <Bone w={60} h={30} />
      <Bone w={60} h={30} />
      <div style={{ flex: 1 }} />
      <Bone w={120} h={32} />
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ padding: 0 }}>
      {/* thead */}
      <div style={{ padding: "10px 28px", background: "var(--muted)", display: "flex", gap: 16, borderBottom: "1px solid var(--border)" }}>
        {[80, 180, 90, 90, 80, 90, 110, 90].map((w, i) => (
          <Bone key={i} w={w} h={10} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ padding: "13px 28px", display: "flex", gap: 16, alignItems: "center", borderBottom: "1px solid var(--border)" }}>
          {[180, 90, 90, 72, 80, 90, 110, 90].map((w, j) => (
            <Bone key={j} w={w} h={11} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 16, padding: "24px 28px" }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ background: "var(--card)", border: "1px solid var(--border)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Bone w={100} h={10} />
          <Bone w="60%" h={32} />
          <Bone w="80%" h={10} />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ type = "table" }: { type?: "table" | "cards" | "dashboard" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ensureShimmerStyle(); }, []);

  return (
    <div ref={ref} style={{ flex: 1, overflow: "hidden" }} aria-busy="true" aria-label="Loading page content">
      <ToolbarSkeleton />
      {type === "table" && <TableSkeleton />}
      {type === "cards" && <CardSkeleton />}
      {type === "dashboard" && (
        <>
          <CardSkeleton count={3} />
          <div style={{ padding: "0 28px 24px" }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <Bone w={200} h={12} />
              <div style={{ height: 220, display: "flex", alignItems: "flex-end", gap: 12 }}>
                {[60, 85, 70, 95].map((h, i) => <Bone key={i} w="100%" h={h * 2} style={{ alignSelf: "flex-end" }} />)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
