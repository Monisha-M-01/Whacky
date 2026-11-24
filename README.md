# SafePilot 🛡️ — Deterministic MCP Safety Gateway

**SafePilot** is an everyday personal admin assistant powered by a deterministic **Model Context Protocol (MCP)** Safety Gateway. It bridges the trust gap between consumer AI agents and sensitive personal tools (email, calendars, local files) by enforcing cryptographic integrity, data-flow boundaries, and human-in-the-loop approvals.

---

## 💡 About the Project

When personal AI assistants connect to everyday tools via MCP, traditional security based purely on LLM alignment or keyword filters falls short:
- Attackers can hide prompt injections inside routine emails or invoices.
- Malicious MCP servers can silently mutate their tool manifests to exfiltrate private files (tool rug-pulls).
- Rogue or tricked agents can perform destructive, irreversible write operations without user knowledge.

**SafePilot** solves this by inserting a deterministic, zero-trust gateway between the AI agent and MCP servers:

- **🔒 Cryptographic SHA-256 Manifest Pinning:** Computes and pins tool manifest hashes at startup. Any runtime description tampering or unauthorized parameter change triggers an instant server quarantine.
- **🏷️ Dynamic Taint & Recipient Boundaries:** Untrusted external inputs (e.g., incoming emails) are tagged as tainted. Any data flow attempting an unauthorized write to unverified recipients or sensitive files is blocked deterministically—even when the attack contains zero injection keywords.
- **✋ UPI-Style 1-Tap Consent:** Read tools are auto-allowed in sub-milliseconds, while irreversible write actions (sending emails, modifying calendars, deleting files) are paused for explicit user approval with an exact diff preview.
- **🛡️ Automated PII Masking:** Scrubs sensitive identifiers (national IDs, PAN numbers, phone numbers, bank accounts) from local documents before they reach drafts or external destinations.
- **📒 Signed Audit Passbook:** Tamper-evident ledger tracking every tool call, permission decision, hash signature, and latency overhead.

---

## 🚀 Installation & Setup

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**

---

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

- **Backend API:** `http://localhost:8000`
- **Interactive Swagger Docs:** `http://localhost:8000/docs`

---

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

- **Frontend App:** `http://localhost:5173`

---

## 🛠️ Tech Stack

- **Backend:** Python, FastAPI, Uvicorn, Pydantic, Model Context Protocol (MCP) tool manifests
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4
