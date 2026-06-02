import { useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { Toast } from "./Toast";
import { useMobile } from "../hooks/useMobile";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

type CalEvent = { day: number; title: string; type: string; color: string; time: string };

const EVENTS: CalEvent[] = [
  { day: 2,  title: "Q2 Annual Fund — Email batch 1",   type: "Email",       color: "#CC0000", time: "8:00 AM" },
  { day: 2,  title: "Board Member check-in calls",       type: "Phone",       color: "#D14905", time: "2:00 PM" },
  { day: 5,  title: "Major Gift Pipeline — advisor mtg", type: "In-Person",   color: "#6F7D1C", time: "10:30 AM" },
  { day: 8,  title: "Q2 Annual Fund — Email batch 2",   type: "Email",       color: "#CC0000", time: "8:00 AM" },
  { day: 10, title: "Reunion mailer drop",               type: "Direct Mail", color: "#427E93", time: "All day" },
  { day: 12, title: "Spring Gala thank-you calls",       type: "Phone",       color: "#D14905", time: "1:00 PM" },
  { day: 14, title: "Lapsed Donor — SMS wave 1",        type: "SMS",         color: "#FAC800", time: "9:00 AM" },
  { day: 15, title: "Athletic Fund — Email blast",       type: "Email",       color: "#CC0000", time: "8:00 AM" },
  { day: 17, title: "Major Gift site visit",             type: "In-Person",   color: "#6F7D1C", time: "11:00 AM" },
  { day: 20, title: "Q2 Annual Fund — Email batch 3",   type: "Email",       color: "#CC0000", time: "8:00 AM" },
  { day: 22, title: "Board Member comms round 2",        type: "Phone",       color: "#D14905", time: "3:00 PM" },
  { day: 24, title: "Lapsed Donor — Direct Mail wave",   type: "Direct Mail", color: "#427E93", time: "All day" },
  { day: 25, title: "Constituent cultivation event",     type: "In-Person",   color: "#6F7D1C", time: "6:00 PM" },
  { day: 28, title: "Monthly giving reminder — SMS",     type: "SMS",         color: "#FAC800", time: "9:00 AM" },
  { day: 30, title: "Q3 planning review (internal)",     type: "Internal",    color: "#888888", time: "4:00 PM" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TYPE_LEGEND = [
  { type: "Email",       color: "#CC0000" },
  { type: "Phone",       color: "#D14905" },
  { type: "SMS",         color: "#FAC800" },
  { type: "In-Person",  color: "#6F7D1C" },
  { type: "Direct Mail", color: "#427E93" },
  { type: "Internal",    color: "#888888" },
];

export function CalendarPage({ dark, addToast: _addToast }: { dark: boolean; addToast: (msg: string, type?: Toast["type"]) => void }) {
  const isMobile = useMobile();
  const today = new Date(2026, 5, 2);
  const [current, setCurrent] = useState({ year: 2026, month: 5 });
  const [selected, setSelected] = useState<number | null>(today.getDate());

  const { year, month } = current;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = cells.length / 7;

  const eventsByDay = EVENTS.reduce<Record<number, CalEvent[]>>((acc, e) => {
    if (!acc[e.day]) acc[e.day] = [];
    acc[e.day].push(e);
    return acc;
  }, {});

  const selectedEvents = selected ? (eventsByDay[selected] ?? []) : [];

  const borderColor = "var(--border)";
  const mutedFg = "var(--muted-foreground)";
  const fg = "var(--foreground)";

  const isToday = (d: number) =>
    year === today.getFullYear() && month === today.getMonth() && d === today.getDate();

  const prevMonth = () => setCurrent(c => c.month === 0
    ? { year: c.year - 1, month: 11 }
    : { year: c.year, month: c.month - 1 });

  const nextMonth = () => setCurrent(c => c.month === 11
    ? { year: c.year + 1, month: 0 }
    : { year: c.year, month: c.month + 1 });

  return (
    <main
      style={{ background: "var(--background)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}
      aria-label="Calendar"
    >
      {/* ── Top bar ── */}
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 12, background: "var(--card)", flexShrink: 0, flexWrap: "wrap", rowGap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className={FOCUS_CLASS} onClick={prevMonth} aria-label="Previous month"
            style={{ background: "none", border: `1px solid ${borderColor}`, padding: "5px 9px", cursor: "pointer", color: mutedFg, display: "flex" }}>
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <h2 style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", color: fg, letterSpacing: "0.05em", textTransform: "uppercase", margin: 0, minWidth: 150, textAlign: "center" }}>
            {MONTHS[month]} {year}
          </h2>
          <button className={FOCUS_CLASS} onClick={nextMonth} aria-label="Next month"
            style={{ background: "none", border: `1px solid ${borderColor}`, padding: "5px 9px", cursor: "pointer", color: mutedFg, display: "flex" }}>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Today button */}
        <button className={FOCUS_CLASS}
          onClick={() => { setCurrent({ year: today.getFullYear(), month: today.getMonth() }); setSelected(today.getDate()); }}
          style={{ padding: "5px 14px", fontSize: 11.5, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase", background: "transparent", border: `1px solid ${borderColor}`, color: mutedFg, cursor: "pointer" }}>
          Today
        </button>

        {/* Legend */}
        {!isMobile && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {TYPE_LEGEND.map(({ type, color }) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} aria-hidden="true" />
                <span style={{ fontSize: 10.5, color: mutedFg, fontFamily: "'Roboto Condensed', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Calendar body ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

        {/* Grid */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

          {/* Day-of-week header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flexShrink: 0, borderBottom: `1px solid ${borderColor}` }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: "8px 4px", textAlign: "center", fontSize: 10.5, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: mutedFg, borderRight: `1px solid ${borderColor}` }}>
                {isMobile ? d[0] : d}
              </div>
            ))}
          </div>

          {/* Weeks — flex-grow so rows share equal height */}
          <div style={{ flex: 1, display: "grid", gridTemplateRows: `repeat(${weeks}, 1fr)`, overflow: "hidden" }}>
            {Array.from({ length: weeks }, (_, wi) => (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${borderColor}` }}>
                {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
                  const events = day ? (eventsByDay[day] ?? []) : [];
                  const isSel = day !== null && selected === day;
                  const isTod = day !== null && isToday(day);
                  const maxVisible = isMobile ? 1 : 2;

                  return (
                    <div
                      key={di}
                      role={day !== null ? "button" : undefined}
                      tabIndex={day !== null ? 0 : undefined}
                      aria-label={day !== null ? `${MONTHS[month]} ${day}${events.length ? `, ${events.length} event${events.length !== 1 ? "s" : ""}` : ""}` : undefined}
                      aria-pressed={isSel || undefined}
                      onClick={() => day !== null && setSelected(day)}
                      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && day !== null) setSelected(day); }}
                      className={day !== null ? FOCUS_CLASS : ""}
                      style={{
                        borderRight: `1px solid ${borderColor}`,
                        padding: "6px 6px 4px",
                        background: isSel
                          ? (dark ? "rgba(204,0,0,0.12)" : "rgba(204,0,0,0.06)")
                          : day === null
                            ? (dark ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.025)")
                            : "var(--card)",
                        cursor: day !== null ? "pointer" : "default",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        transition: "background 0.1s",
                      }}
                    >
                      {day !== null && (
                        <>
                          {/* Day number */}
                          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 2 }}>
                            <span style={{
                              width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11.5, fontFamily: "'Roboto Mono', monospace", fontWeight: isTod || isSel ? 700 : 400,
                              background: isTod ? "#CC0000" : "transparent",
                              color: isTod ? "#fff" : isSel ? (dark ? "#ff6060" : "#CC0000") : fg,
                              flexShrink: 0,
                            }}>
                              {day}
                            </span>
                          </div>

                          {/* Event pills */}
                          {events.slice(0, maxVisible).map((ev, ei) => (
                            <div key={ei} style={{
                              fontSize: 9.5, color: "#fff", background: ev.color,
                              padding: "2px 5px", overflow: "hidden", textOverflow: "ellipsis",
                              whiteSpace: "nowrap", lineHeight: 1.4, flexShrink: 0,
                            }}>
                              {ev.title}
                            </div>
                          ))}
                          {events.length > maxVisible && (
                            <div style={{ fontSize: 9.5, color: mutedFg, paddingLeft: 2 }}>
                              +{events.length - maxVisible} more
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Day detail panel ── */}
        {!isMobile && (
          <div style={{ width: 240, flexShrink: 0, borderLeft: `1px solid ${borderColor}`, background: "var(--card)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Panel header */}
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${borderColor}`, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: mutedFg }}>
                {selected ? `${MONTHS[month]} ${selected}, ${year}` : "Select a day"}
              </div>
              {selected && (
                <div style={{ fontSize: 12, color: mutedFg, marginTop: 2 }}>
                  {selectedEvents.length === 0 ? "No touchpoints" : `${selectedEvents.length} touchpoint${selectedEvents.length !== 1 ? "s" : ""}`}
                </div>
              )}
            </div>

            {/* Events list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
              {!selected && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: mutedFg, fontSize: 12 }}>
                  Click a day to see scheduled touchpoints.
                </div>
              )}
              {selected && selectedEvents.length === 0 && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: mutedFg, fontSize: 12 }}>
                  No touchpoints scheduled for this day.
                </div>
              )}
              {selectedEvents.map((ev, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: i < selectedEvents.length - 1 ? `1px solid ${borderColor}` : "none" }}>
                  <div style={{ width: 3, alignSelf: "stretch", background: ev.color, flexShrink: 0 }} aria-hidden="true" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: fg, lineHeight: 1.4 }}>{ev.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Clock size={10} style={{ color: mutedFg }} aria-hidden="true" />
                      <span style={{ fontSize: 11, color: mutedFg, fontFamily: "'Roboto Mono', monospace" }}>{ev.time}</span>
                    </div>
                    <div style={{ marginTop: 3 }}>
                      <span style={{ fontSize: 10.5, padding: "1px 6px", background: `${ev.color}22`, color: ev.color, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        {ev.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile: selected day events appear below as a sheet */}
      {isMobile && selected && selectedEvents.length > 0 && (
        <div style={{ borderTop: `2px solid var(--border)`, background: "var(--card)", maxHeight: 220, overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${borderColor}`, fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.07em", textTransform: "uppercase", color: mutedFg }}>
            {MONTHS[month]} {selected} — {selectedEvents.length} touchpoint{selectedEvents.length !== 1 ? "s" : ""}
          </div>
          {selectedEvents.map((ev, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: i < selectedEvents.length - 1 ? `1px solid ${borderColor}` : "none" }}>
              <div style={{ width: 3, background: ev.color, flexShrink: 0 }} aria-hidden="true" />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: fg }}>{ev.title}</div>
                <div style={{ fontSize: 11, color: mutedFg, marginTop: 2, fontFamily: "'Roboto Mono', monospace" }}>{ev.time} · {ev.type}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
