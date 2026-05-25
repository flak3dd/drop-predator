/**
 * app/components/pilot/GenerateForms.jsx
 * ---------------------------------------------------------
 * AI content generation form components for the Pilot page.
 */

import { useState } from "react";

const formInput = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid var(--p-color-border)",
  background: "var(--p-color-bg-surface)",
  color: "var(--p-color-text)",
  fontSize: 12,
  boxSizing: "border-box",
  marginTop: 4,
  marginBottom: 12,
};

const formLabel = {
  fontSize: 11,
  color: "var(--p-color-text-secondary)",
  display: "block",
};

// ─── Listing Form ──────────────────────────────────────────────────────────

export function ListingForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ name: "", category: "", vendor: "", price: "", notes: "" });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div>
      <label style={formLabel}>Product name *
        <input style={formInput} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Merino Wool Beanie" />
      </label>
      <label style={formLabel}>Category
        <input style={formInput} value={form.category} onChange={e => set("category", e.target.value)} placeholder="Apparel & Accessories" />
      </label>
      <label style={formLabel}>Vendor/Brand
        <input style={formInput} value={form.vendor} onChange={e => set("vendor", e.target.value)} placeholder="WoolCo" />
      </label>
      <label style={formLabel}>Price ($)
        <input style={formInput} type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="49.99" />
      </label>
      <label style={formLabel}>Notes
        <textarea style={{ ...formInput, fontFamily: "inherit" }} value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="100% merino, unisex, machine washable" />
      </label>
      <s-button variant="primary" size="slim" onClick={() => onSubmit({ ...form, price: Number(form.price) || undefined })} disabled={!form.name || loading}>
        {loading ? "Generating..." : "Generate Listing"}
      </s-button>
    </div>
  );
}


// ─── Description Form ──────────────────────────────────────────────────────

export function DescriptionForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ product: "", tone: "Professional & trustworthy", audience: "", keywords: "" });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div>
      <label style={formLabel}>Product name *
        <input style={formInput} value={form.product} onChange={e => set("product", e.target.value)} placeholder="Merino Wool Beanie" />
      </label>
      <label style={formLabel}>Tone
        <select style={formInput} value={form.tone} onChange={e => set("tone", e.target.value)}>
          <option>Professional & trustworthy</option>
          <option>Casual & fun</option>
          <option>Luxury & premium</option>
          <option>Minimalist & clean</option>
        </select>
      </label>
      <label style={formLabel}>Target audience
        <input style={formInput} value={form.audience} onChange={e => set("audience", e.target.value)} placeholder="outdoor enthusiasts 25-45" />
      </label>
      <label style={formLabel}>Keywords
        <input style={formInput} value={form.keywords} onChange={e => set("keywords", e.target.value)} placeholder="merino wool, warm beanie, machine washable" />
      </label>
      <s-button variant="primary" size="slim" onClick={() => onSubmit(form)} disabled={!form.product || loading}>
        {loading ? "Generating..." : "Generate Description"}
      </s-button>
    </div>
  );
}


// ─── Shipping Form ─────────────────────────────────────────────────────────

export function ShippingForm({ onSubmit, loading }) {
  const [prompt, setPrompt] = useState("");

  return (
    <div>
      <label style={formLabel}>Shipping requirement (plain English)
        <textarea
          style={{ ...formInput, fontFamily: "inherit" }}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={3}
          placeholder="Add free shipping for orders over $100 to New Zealand"
        />
      </label>
      <s-button variant="primary" size="slim" onClick={() => onSubmit({ prompt })} disabled={!prompt || loading}>
        {loading ? "Generating..." : "Generate Rule"}
      </s-button>
    </div>
  );
}


// ─── Email Form ────────────────────────────────────────────────────────────

export function EmailForm({ onSubmit, loading }) {
  const [form, setForm] = useState({ customerName: "", subject: "", body: "" });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div>
      <label style={formLabel}>Customer name
        <input style={formInput} value={form.customerName} onChange={e => set("customerName", e.target.value)} placeholder="Sarah K." />
      </label>
      <label style={formLabel}>Subject
        <input style={formInput} value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="Where is my order #4821?" />
      </label>
      <label style={formLabel}>Email body *
        <textarea
          style={{ ...formInput, fontFamily: "inherit" }}
          value={form.body}
          onChange={e => set("body", e.target.value)}
          rows={4}
          placeholder="Hi, I placed order #4821 on May 18th and it hasn't arrived yet..."
        />
      </label>
      <s-button variant="primary" size="slim" onClick={() => onSubmit(form)} disabled={!form.body || loading}>
        {loading ? "Generating..." : "Draft Reply"}
      </s-button>
    </div>
  );
}


// ─── Image Search Form ─────────────────────────────────────────────────────

export function ImageSearchForm({ onSubmit, loading }) {
  const [form, setForm] = useState({
    product: "",
    category: "",
    maxImages: 8,
    strategies: ["google", "bing", "aliexpress", "duckduckgo"],
    validate: false,
  });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const allStrategies = [
    { id: "google", label: "Google (dork)" },
    { id: "bing", label: "Bing Images" },
    { id: "aliexpress", label: "AliExpress" },
    { id: "cj", label: "CJ Dropshipping" },
    { id: "unsplash", label: "Unsplash" },
    { id: "duckduckgo", label: "DuckDuckGo" },
  ];

  const toggleStrategy = (id) => {
    set("strategies", form.strategies.includes(id)
      ? form.strategies.filter(s => s !== id)
      : [...form.strategies, id]);
  };

  return (
    <div>
      <label style={formLabel}>Product name *
        <input style={formInput} value={form.product} onChange={e => set("product", e.target.value)} placeholder="Tactical Resistance Band Set" />
      </label>
      <label style={formLabel}>Category
        <input style={formInput} value={form.category} onChange={e => set("category", e.target.value)} placeholder="Gym & Fitness" />
      </label>
      <label style={formLabel}>Max images
        <input style={formInput} type="number" value={form.maxImages} onChange={e => set("maxImages", parseInt(e.target.value) || 8)} min={1} max={20} />
      </label>

      <div style={{ marginBottom: 12 }}>
        <div style={formLabel}>Search strategies</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {allStrategies.map(s => (
            <button
              key={s.id}
              onClick={() => toggleStrategy(s.id)}
              style={{
                fontSize: 10,
                padding: "4px 8px",
                borderRadius: 4,
                cursor: "pointer",
                border: form.strategies.includes(s.id)
                  ? "1px solid var(--p-color-border-emphasis)"
                  : "1px solid var(--p-color-border)",
                background: form.strategies.includes(s.id)
                  ? "var(--p-color-bg-surface-secondary)"
                  : "var(--p-color-bg-surface)",
                color: form.strategies.includes(s.id)
                  ? "var(--p-color-text)"
                  : "var(--p-color-text-secondary)",
              }}
            >
              {form.strategies.includes(s.id) ? "✓ " : ""}{s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.validate}
            onChange={e => set("validate", e.target.checked)}
          />
          <span style={{ color: "var(--p-color-text-secondary)" }}>Validate URLs (slower, confirms images are reachable)</span>
        </label>
      </div>

      <s-button variant="primary" size="slim" onClick={() => onSubmit(form)} disabled={!form.product || form.strategies.length === 0 || loading}>
        {loading ? "Searching..." : "Search Images"}
      </s-button>
    </div>
  );
}

