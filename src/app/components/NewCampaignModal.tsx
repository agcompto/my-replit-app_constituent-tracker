import { useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronLeft, Check, Megaphone } from "lucide-react";
import type { Toast } from "./Toast";

const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]";

const CAMPAIGN_TYPES = ["Solicitation", "Cultivation", "Stewardship", "Acknowledgment", "Event"];
const CHANNELS = ["Email", "Phone", "Direct Mail", "SMS", "In-Person"];
const OWNERS = ["Jordan Rivera", "Priya Sharma", "Marcus Webb", "Elena Marchetti", "Sandra Kowalski", "David O'Brien"];

const STEPS = ["Basics", "Targeting", "Review"];

interface Form {
  name: string;
  type: string;
  description: string;
  channel: string;
  owner: string;
  startDate: string;
  endDate: string;
  constituentCount: string;
}

const EMPTY_FORM: Form = {
  name: "", type: "", description: "",
  channel: "", owner: "", startDate: "", endDate: "", constituentCount: "",
};

interface Props {
  open: boolean;
  dark: boolean;
  onClose: () => void;
  addToast: (msg: string, type?: Toast["type"]) => void;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
        {label}{required && <span style={{ color: "#CC0000", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT_STYLE = {
  width: "100%", padding: "8px 10px", background: "var(--input-background)",
  border: "1px solid var(--border)", fontSize: 13, color: "var(--foreground)",
  outline: "none", fontFamily: "'Roboto', sans-serif", boxSizing: "border-box" as const,
};

const SELECT_STYLE = { ...INPUT_STYLE, cursor: "pointer" };

export function NewCampaignModal({ open, dark, onClose, addToast }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setStep(0); setForm(EMPTY_FORM); setErrors({}); setTimeout(() => firstInputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const set = (k: keyof Form, v: string) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };

  const validateStep = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (step === 0) {
      if (!form.name.trim()) e.name = "Campaign name is required.";
      if (!form.type) e.type = "Select a campaign type.";
    }
    if (step === 1) {
      if (!form.channel) e.channel = "Select a channel.";
      if (!form.owner) e.owner = "Assign an owner.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  const submit = () => {
    addToast(`Campaign "${form.name}" created successfully`, "success");
    onClose();
  };

  const borderColor = "var(--border)";
  const fg = "var(--foreground)";
  const mutedFg = "var(--muted-foreground)";

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50 }} />

      <div role="dialog" aria-label="Create new campaign" aria-modal="true"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(560px,92vw)", zIndex: 51, background: "var(--card)", border: `1px solid ${borderColor}`, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 12 }}>
          <Megaphone size={15} style={{ color: dark ? "#ff6060" : "#CC0000" }} aria-hidden="true" />
          <h2 style={{ flex: 1, margin: 0, fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", color: fg }}>
            New Campaign
          </h2>
          <button onClick={onClose} aria-label="Close" className={FOCUS_CLASS}
            style={{ background: "none", border: `1px solid ${borderColor}`, padding: 6, cursor: "pointer", color: mutedFg, display: "flex" }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", borderBottom: `1px solid ${borderColor}` }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.07em", textTransform: "uppercase", borderBottom: i === step ? "2px solid #CC0000" : "2px solid transparent", color: i === step ? (dark ? "#ff6060" : "#CC0000") : i < step ? "var(--muted-foreground)" : "var(--muted-foreground)", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ width: 18, height: 18, background: i < step ? "#6F7D1C" : i === step ? (dark ? "#ff6060" : "#CC0000") : "var(--muted)", color: i <= step ? "#fff" : mutedFg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                {i < step ? <Check size={10} aria-hidden="true" /> : i + 1}
              </span>
              {s}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: 24, flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Step 0: Basics */}
          {step === 0 && (
            <>
              <Field label="Campaign Name" required>
                <input ref={firstInputRef} type="text" value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Fall Alumni Fund Drive" className={FOCUS_CLASS} style={{ ...INPUT_STYLE, borderColor: errors.name ? "#CC0000" : "var(--border)" }} />
                {errors.name && <span style={{ fontSize: 11, color: "#CC0000" }}>{errors.name}</span>}
              </Field>
              <Field label="Campaign Type" required>
                <select value={form.type} onChange={e => set("type", e.target.value)} className={FOCUS_CLASS}
                  style={{ ...SELECT_STYLE, borderColor: errors.type ? "#CC0000" : "var(--border)" }}>
                  <option value="">Select type…</option>
                  {CAMPAIGN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.type && <span style={{ fontSize: 11, color: "#CC0000" }}>{errors.type}</span>}
              </Field>
              <Field label="Description">
                <textarea value={form.description} onChange={e => set("description", e.target.value)}
                  placeholder="Brief description of the campaign goal…" rows={3} className={FOCUS_CLASS}
                  style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.5 }} />
              </Field>
            </>
          )}

          {/* Step 1: Targeting */}
          {step === 1 && (
            <>
              <Field label="Primary Channel" required>
                <select value={form.channel} onChange={e => set("channel", e.target.value)} className={FOCUS_CLASS}
                  style={{ ...SELECT_STYLE, borderColor: errors.channel ? "#CC0000" : "var(--border)" }}>
                  <option value="">Select channel…</option>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {errors.channel && <span style={{ fontSize: 11, color: "#CC0000" }}>{errors.channel}</span>}
              </Field>
              <Field label="Campaign Owner" required>
                <select value={form.owner} onChange={e => set("owner", e.target.value)} className={FOCUS_CLASS}
                  style={{ ...SELECT_STYLE, borderColor: errors.owner ? "#CC0000" : "var(--border)" }}>
                  <option value="">Assign owner…</option>
                  {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {errors.owner && <span style={{ fontSize: 11, color: "#CC0000" }}>{errors.owner}</span>}
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <Field label="Start Date">
                  <input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)}
                    className={FOCUS_CLASS} style={INPUT_STYLE} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)}
                    className={FOCUS_CLASS} style={INPUT_STYLE} />
                </Field>
              </div>
              <Field label="Estimated Constituent Count">
                <input type="number" min="0" value={form.constituentCount} onChange={e => set("constituentCount", e.target.value)}
                  placeholder="0" className={FOCUS_CLASS} style={INPUT_STYLE} />
              </Field>
            </>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <p style={{ fontSize: 12.5, color: mutedFg, margin: "0 0 16px", lineHeight: 1.6 }}>
                Review the campaign details before creating. You can go back to make changes.
              </p>
              {[
                { label: "Name", value: form.name },
                { label: "Type", value: form.type },
                { label: "Description", value: form.description || "—" },
                { label: "Channel", value: form.channel },
                { label: "Owner", value: form.owner },
                { label: "Start Date", value: form.startDate || "—" },
                { label: "End Date", value: form.endDate || "—" },
                { label: "Est. Constituents", value: form.constituentCount ? Number(form.constituentCount).toLocaleString() : "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${borderColor}` }}>
                  <span style={{ width: 140, flexShrink: 0, fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: mutedFg, paddingTop: 1 }}>{label}</span>
                  <span style={{ fontSize: 13, color: fg }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${borderColor}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button onClick={step === 0 ? onClose : back} className={FOCUS_CLASS}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", background: "transparent", border: `1px solid ${borderColor}`, cursor: "pointer", fontSize: 12, color: mutedFg }}>
            {step === 0 ? "Cancel" : <><ChevronLeft size={13} aria-hidden="true" /> Back</>}
          </button>
          {step < 2 ? (
            <button onClick={next} className={FOCUS_CLASS}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", background: "#CC0000", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Next <ChevronRight size={13} aria-hidden="true" />
            </button>
          ) : (
            <button onClick={submit} className={FOCUS_CLASS}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", background: "#CC0000", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Roboto Condensed', sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <Check size={13} aria-hidden="true" /> Create Campaign
            </button>
          )}
        </div>
      </div>
    </>
  );
}
