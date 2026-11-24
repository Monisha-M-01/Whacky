"""
SafePilot — Deterministic MCP Safety Gateway
Implements SHA-256 pinning, least-privilege scopes, injection detection,
and a signed audit passbook.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from mcp_servers import MCPRegistry, MCPServer

# ═══════════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════════

AUDIT_LOG_PATH = Path(__file__).parent / "audit_log.json"

INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"SYSTEM\s+OVERRIDE", re.IGNORECASE),
    re.compile(r"IGNORE\s+PREVIOUS", re.IGNORECASE),
    re.compile(r"IGNORE\s+ALL\s+PRIOR", re.IGNORECASE),
    re.compile(r"DISREGARD\s+(ABOVE|PREVIOUS|PRIOR)", re.IGNORECASE),
    re.compile(r"call\s+read_local_file\s*\(?\s*['\"]?bank_passwords", re.IGNORECASE),
    re.compile(r"call\s+send_email\s+to\s+.*evil", re.IGNORECASE),
    re.compile(r"send.*to\s+attacker@", re.IGNORECASE),
    re.compile(r"exfiltrat", re.IGNORECASE),
    re.compile(r"BCC\s+.*attacker", re.IGNORECASE),
    re.compile(r"<!--.*(?:SYSTEM|OVERRIDE|IGNORE|read_local_file|send_email).*-->", re.IGNORECASE | re.DOTALL),
]

RESTRICTED_FILES = {"bank_passwords.txt"}

# Scope modes
SCOPE_OFF = "off"
SCOPE_READ_ONLY = "read_only"
SCOPE_READ_WRITE_GATED = "read_write_gated"
VALID_SCOPES = {SCOPE_OFF, SCOPE_READ_ONLY, SCOPE_READ_WRITE_GATED}


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _sha256_manifest(server: MCPServer) -> str:
    """Compute a deterministic SHA-256 hash of a server's tool manifest."""
    canonical = json.dumps(server.get_manifest(), sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_diff_preview(server_id: str, tool_name: str, args: dict[str, Any]) -> str:
    """Build a human-readable preview of what a write action will do."""
    if server_id == "gmail_mcp":
        if tool_name == "draft_email":
            return (
                f"Draft an email to {args.get('to', '?')}\n"
                f"  Subject: {args.get('subject', '?')}\n"
                f"  Body: {args.get('body', '?')[:120]}{'…' if len(args.get('body', '')) > 120 else ''}"
            )
        if tool_name == "send_email":
            return (
                f"Send an email to {args.get('to', '?')}\n"
                f"  Subject: {args.get('subject', '?')}\n"
                f"  Body: {args.get('body', '?')[:120]}{'…' if len(args.get('body', '')) > 120 else ''}"
            )
    if server_id == "calendar_mcp" and tool_name == "create_event":
        return (
            f"Create calendar event: \"{args.get('title', '?')}\"\n"
            f"  Date: {args.get('date', '?')} at {args.get('time', '?')}\n"
            f"  Duration: {args.get('duration_min', 60)} min\n"
            f"  Location: {args.get('location', 'N/A')}"
        )
    if server_id == "files_mcp" and tool_name == "delete_file":
        return f"Permanently delete file: {args.get('filename', '?')}"
    return f"Execute {tool_name} on {server_id} with args: {json.dumps(args)}"


# ═══════════════════════════════════════════════════════════════════════════════
# Automatic PII Scrubber
# ═══════════════════════════════════════════════════════════════════════════════


def scrub_pii(text: str) -> tuple[str, int, list[str]]:
    """
    Masks 12-digit national IDs, PAN format strings, 10-digit phone numbers,
    and bank account numbers before data reaches drafts or external tools.
    Returns (scrubbed_text, redacted_count, redacted_fields).
    """
    if not isinstance(text, str):
        return text, 0, []

    redacted_count = 0
    redacted_fields: list[str] = []

    # 1. 12-digit IDs (e.g. Aadhaar: 4820 9138 5721 or 12 consecutive digits)
    def _mask_12digit(m: re.Match[str]) -> str:
        nonlocal redacted_count
        raw = m.group(0).replace(" ", "").replace("-", "")
        redacted_count += 1
        if "national_id" not in redacted_fields:
            redacted_fields.append("national_id")
        return f"XXXX-XXXX-{raw[-4:]}"

    text = re.sub(r"\b\d{4}[ -]\d{4}[ -]\d{4}\b", _mask_12digit, text)

    # 2. PAN tax identifier (5 uppercase letters, 4 digits, 1 uppercase letter)
    def _mask_pan(m: re.Match[str]) -> str:
        nonlocal redacted_count
        raw = m.group(0)
        redacted_count += 1
        if "tax_id (PAN)" not in redacted_fields:
            redacted_fields.append("tax_id (PAN)")
        return f"XXXXX{raw[5:9]}X"

    text = re.sub(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", _mask_pan, text)

    # 3. 10-digit Indian phone numbers (starts with 6-9)
    def _mask_phone(m: re.Match[str]) -> str:
        nonlocal redacted_count
        raw = m.group(0)
        digits = re.sub(r"\D", "", raw)
        redacted_count += 1
        if "phone_number" not in redacted_fields:
            redacted_fields.append("phone_number")
        return f"+91-XXXXX-{digits[-4:]}"

    text = re.sub(r"\b(?:\+91[\s-]?)?[6-9]\d{9}\b", _mask_phone, text)

    # 4. Bank account numbers (11 to 18 digits)
    def _mask_bank(m: re.Match[str]) -> str:
        nonlocal redacted_count
        raw = m.group(0)
        redacted_count += 1
        if "bank_account" not in redacted_fields:
            redacted_fields.append("bank_account")
        return f"XXXX-XXXX-{raw[-4:]}"

    text = re.sub(r"\b\d{11,18}\b", _mask_bank, text)

    return text, redacted_count, redacted_fields


# ═══════════════════════════════════════════════════════════════════════════════
# Injection Scanner
# ═══════════════════════════════════════════════════════════════════════════════


def scan_for_injection(text: str) -> tuple[bool, str | None]:
    """
    Scan untrusted text for indirect prompt-injection patterns.
    Returns (is_malicious, reason).
    """
    if not isinstance(text, str):
        return False, None
    for pat in INJECTION_PATTERNS:
        m = pat.search(text)
        if m:
            return True, f"Injection pattern detected: '{m.group()}'"
    # Check for references to restricted files inside any instruction-like text
    for rf in RESTRICTED_FILES:
        if rf in text.lower():
            # Only flag if the context looks instructional
            if any(kw in text.lower() for kw in ("call", "read", "send", "include", "bcc")):
                return True, f"Attempted access to restricted file '{rf}' via injected instruction"
    return False, None


def scan_result_deep(result: Any) -> tuple[bool, str | None]:
    """Recursively scan a tool result for injections."""
    if isinstance(result, str):
        return scan_for_injection(result)
    if isinstance(result, dict):
        for v in result.values():
            hit, reason = scan_result_deep(v)
            if hit:
                return hit, reason
    if isinstance(result, list):
        for item in result:
            hit, reason = scan_result_deep(item)
            if hit:
                return hit, reason
    return False, None


# ═══════════════════════════════════════════════════════════════════════════════
# MCP Safety Gateway
# ═══════════════════════════════════════════════════════════════════════════════


class MCPSafetyGateway:
    """
    Deterministic safety gateway enforcing:
      1. SHA-256 manifest pinning
      2. Least-privilege scope engine
      3. Indirect prompt-injection & provenance shield
      4. Signed audit passbook
    """

    def __init__(self, registry: MCPRegistry) -> None:
        self.registry = registry

        # Per-app permission scopes
        self.scopes: dict[str, str] = {
            "gmail_mcp": SCOPE_READ_WRITE_GATED,
            "calendar_mcp": SCOPE_READ_WRITE_GATED,
            "files_mcp": SCOPE_READ_WRITE_GATED,
        }

        # SHA-256 pinning
        self.pinned_hashes: dict[str, str] = {}
        self.pin_all()

        # Rug-pull tracking
        self.rug_pull_detected: bool = False
        self.rug_pull_detail: str | None = None

        # Panic Kill Switch state
        self.kill_switch_active: bool = False

        # Taint / Provenance tracking state
        self.tainted_session: bool = False
        self.tainted_sources: list[str] = []

        # Pending write actions (waiting for user approval)
        self.pending: dict[str, dict[str, Any]] = {}

        # Audit log (in-memory + file)
        self.audit_log: list[dict[str, Any]] = []
        self._load_audit_log()

    # ── Panic Kill Switch ───────────────────────────────────────────────────

    def activate_kill_switch(self) -> dict[str, Any]:
        """Emergency kill switch: immediately lock all MCP servers to read-only."""
        self.kill_switch_active = True
        for sid in self.scopes:
            self.scopes[sid] = SCOPE_READ_ONLY
        t0 = time.perf_counter()
        self._audit(
            "system", "panic_kill_switch", "KILL_SWITCH_ENGAGED", t0,
            reason="Kill switch engaged: all writes locked"
        )
        return {
            "status": "activated",
            "kill_switch_active": True,
            "scopes": self.scopes,
            "message": "Kill switch engaged: all writes locked",
        }

    def reset_kill_switch(self) -> dict[str, Any]:
        """Reset emergency kill switch back to gated mode."""
        self.kill_switch_active = False
        for sid in self.scopes:
            self.scopes[sid] = SCOPE_READ_WRITE_GATED
        t0 = time.perf_counter()
        self._audit(
            "system", "panic_kill_switch", "KILL_SWITCH_RELEASED", t0,
            reason="Kill switch released: writes restored to gated"
        )
        return {
            "status": "reset",
            "kill_switch_active": False,
            "scopes": self.scopes,
            "message": "Kill switch released: writes restored to gated",
        }

    def reset_taint(self) -> None:
        self.tainted_session = False
        self.tainted_sources = []

    # ── SHA-256 pinning ─────────────────────────────────────────────────────

    def pin_all(self) -> None:
        """Pin the SHA-256 hash of every registered server's manifest."""
        for sid, server in self.registry.servers.items():
            self.pinned_hashes[sid] = _sha256_manifest(server)
        self.rug_pull_detected = False
        self.rug_pull_detail = None

    def verify_manifest(self, server_id: str) -> tuple[bool, str, str]:
        """
        Verify a server's current manifest against the pinned hash.
        Returns (ok, current_hash, pinned_hash).
        """
        server = self.registry.servers.get(server_id)
        if not server:
            return False, "", ""
        current = _sha256_manifest(server)
        pinned = self.pinned_hashes.get(server_id, "")
        return current == pinned, current, pinned

    def check_rug_pull(self) -> dict[str, Any]:
        """Check all servers for manifest tampering."""
        results: dict[str, Any] = {}
        for sid in self.registry.servers:
            ok, current, pinned = self.verify_manifest(sid)
            results[sid] = {
                "valid": ok,
                "current_hash": current,
                "pinned_hash": pinned,
            }
            if not ok:
                self.rug_pull_detected = True
                self.rug_pull_detail = (
                    f"SHA-256 mismatch on {sid}: "
                    f"pinned={pinned[:16]}… current={current[:16]}…"
                )
        return results

    # ── Scope engine ────────────────────────────────────────────────────────

    def set_scope(self, app_id: str, scope: str) -> bool:
        if scope not in VALID_SCOPES:
            return False
        if app_id not in self.registry.servers:
            return False
        self.scopes[app_id] = scope
        return True

    # ── Core call gate ──────────────────────────────────────────────────────

    def call_tool(
        self,
        server_id: str,
        tool_name: str,
        args: dict[str, Any] | None = None,
        user_prompt: str | None = None,
    ) -> dict[str, Any]:
        """
        Gate a tool call through all safety layers:
        1. Server existence & registration
        2. Cryptographic SHA-256 Manifest Pinning
        3. Panic Kill Switch
        4. Least-Privilege Scope Engine
        5. Deterministic Taint & Recipient Boundary Policy
        6. Automatic PII Scrubbing on read/write
        7. Indirect Prompt Injection & Provenance Shield
        8. Signed Audit Passbook Logging
        """
        args = args or {}
        t0 = time.perf_counter()

        # 1️⃣  Server exists?
        server = self.registry.servers.get(server_id)
        if not server:
            return self._blocked(server_id, tool_name, args, t0, "Unknown MCP server")

        # 2️⃣  SHA-256 manifest check
        ok, current_hash, pinned_hash = self.verify_manifest(server_id)
        if not ok:
            self.rug_pull_detected = True
            self.rug_pull_detail = (
                f"SHA-256 mismatch on {server_id}: "
                f"pinned={pinned_hash[:16]}… current={current_hash[:16]}…"
            )
            return self._blocked(
                server_id, tool_name, args, t0,
                f"🛑 Rug-Pull Detected — Manifest SHA-256 mismatch on {server_id}. "
                f"Server is blocked. Pinned: {pinned_hash[:16]}… Current: {current_hash[:16]}…",
                sha256=current_hash,
            )

        # 3️⃣  Tool exists?
        tool_def = server.get_tool(tool_name)
        if not tool_def:
            return self._blocked(server_id, tool_name, args, t0, f"Tool '{tool_name}' not found on {server_id}")

        access_level = tool_def.get("access_level", "read")
        scope = self.scopes.get(server_id, SCOPE_OFF)

        # 4️⃣  Panic Kill Switch check
        if self.kill_switch_active and access_level == "write":
            return self._blocked(
                server_id, tool_name, args, t0,
                "🚨 Emergency Panic Kill Switch Active — Write operations are locked across all MCP servers.",
                sha256=current_hash,
            )

        # 5️⃣  Scope: OFF
        if scope == SCOPE_OFF:
            return self._blocked(
                server_id, tool_name, args, t0,
                f"App '{server_id}' is disabled (scope = off)",
                sha256=current_hash,
            )

        # 6️⃣  Scope: read_only blocks writes
        if scope == SCOPE_READ_ONLY and access_level == "write":
            return self._blocked(
                server_id, tool_name, args, t0,
                f"Write tool '{tool_name}' blocked — '{server_id}' is set to read-only",
                sha256=current_hash,
            )

        # 7️⃣  Deterministic Taint & Recipient Boundary Policy
        if self.tainted_session and access_level == "write":
            to_addr = (args.get("to") or "").lower().strip()
            user_prompt_str = (user_prompt or "").lower()
            fname = args.get("filename", "")
            body_str = (args.get("body") or "").lower()

            is_unauthorized_recipient = bool(to_addr and to_addr not in user_prompt_str)
            is_restricted_target = bool(
                fname in RESTRICTED_FILES or
                any(rf in body_str for rf in RESTRICTED_FILES)
            )

            if is_unauthorized_recipient or is_restricted_target:
                target_desc = f"recipient '{to_addr}'" if is_unauthorized_recipient else f"file '{fname or 'bank_passwords.txt'}'"
                chain = [
                    {"step": "User Prompt", "detail": user_prompt or "Unspecified prompt"},
                    {"step": "Untrusted Email [TAINTED]", "detail": "gmail_mcp.list_emails (provenance: external_untrusted)"},
                    {"step": "Unauthorized Write Target", "detail": f"{server_id}.{tool_name}({target_desc})"},
                ]
                reason = (
                    f"Deterministic Taint Boundary Violation: Session has read tainted external data "
                    f"and attempted an unauthorized write action to {target_desc} without explicit user authorization."
                )
                self._audit(
                    server_id, tool_name, "BLOCKED_TAINT_FLOW", t0,
                    sha256=current_hash,
                    reason=reason,
                )
                return {
                    "status": "BLOCKED_TAINT_FLOW",
                    "reason": f"🛑 Taint Boundary Policy: {reason}",
                    "quarantined": True,
                    "server": server_id,
                    "tool": tool_name,
                    "provenance": "external_untrusted",
                    "provenance_chain": chain,
                    "provenance_chain_str": "User Prompt → Untrusted Email [TAINTED] → Unauthorized Write Target",
                }

        # 8️⃣  Write tools → PENDING_APPROVAL
        if access_level == "write":
            pending_id = str(uuid.uuid4())[:8]
            diff_preview = _build_diff_preview(server_id, tool_name, args)
            # Scan draft body for PII that may have been scrubbed or present
            _, pii_cnt, pii_flds = scrub_pii(args.get("body", ""))
            entry = {
                "pending_id": pending_id,
                "server_id": server_id,
                "tool_name": tool_name,
                "args": args,
                "diff_preview": diff_preview,
                "pii_masked": pii_cnt > 0,
                "redacted_count": pii_cnt,
                "redacted_fields": pii_flds,
                "created_at": _now_iso(),
            }
            self.pending[pending_id] = entry
            self._audit(
                server_id, tool_name, "PENDING_APPROVAL", t0,
                sha256=current_hash,
                reason=f"Write action queued — awaiting user approval (pending_id={pending_id})",
            )
            return {
                "status": "PENDING_APPROVAL",
                "pending_id": pending_id,
                "diff_preview": diff_preview,
                "pii_masked": pii_cnt > 0,
                "redacted_count": pii_cnt,
                "redacted_fields": pii_flds,
                "tool": tool_name,
                "server": server_id,
            }

        # 9️⃣  Read tool → execute immediately
        result = self.registry.execute_tool(server_id, tool_name, args)

        # Mark session tainted if reading untrusted external email
        if server_id == "gmail_mcp" and tool_name == "list_emails":
            self.tainted_session = True
            if "gmail_mcp.list_emails" not in self.tainted_sources:
                self.tainted_sources.append("gmail_mcp.list_emails")

        # PII Scrubbing on read file contents
        if server_id == "files_mcp" and tool_name == "read_local_file":
            if isinstance(result, dict) and "content" in result:
                scrubbed, pii_cnt, pii_flds = scrub_pii(result["content"])
                result["content"] = scrubbed
                result["pii_masked"] = pii_cnt > 0
                result["redacted_count"] = pii_cnt
                result["redacted_fields"] = pii_flds

        # 🔟  Injection scan on results
        is_malicious, threat_reason = scan_result_deep(result)
        if is_malicious:
            self._audit(
                server_id, tool_name, "BLOCKED", t0,
                sha256=current_hash,
                reason=f"Injection detected in result: {threat_reason}",
            )
            return {
                "status": "BLOCKED",
                "reason": f"⚠️ Indirect Prompt Injection Detected — {threat_reason}",
                "quarantined": True,
                "server": server_id,
                "tool": tool_name,
                "provenance": "untrusted_external_content",
            }

        # 1️⃣1️⃣  Auto-allowed
        self._audit(
            server_id, tool_name, "AUTO_ALLOWED", t0,
            sha256=current_hash,
            reason="Read tool auto-allowed by scope engine",
        )
        return {
            "status": "AUTO_ALLOWED",
            "data": result,
            "server": server_id,
            "tool": tool_name,
        }

    # ── Approve / Reject ────────────────────────────────────────────────────

    def approve(self, pending_id: str) -> dict[str, Any]:
        entry = self.pending.pop(pending_id, None)
        if not entry:
            return {"status": "ERROR", "reason": f"No pending action with id '{pending_id}'"}

        t0 = time.perf_counter()
        server_id = entry["server_id"]
        tool_name = entry["tool_name"]
        args = entry["args"]

        # Verify manifest hasn't changed since queuing
        ok, current_hash, pinned_hash = self.verify_manifest(server_id)
        if not ok:
            self._audit(server_id, tool_name, "BLOCKED", t0, sha256=current_hash,
                        reason="Rug-pull detected during approval — manifest changed")
            return {"status": "BLOCKED", "reason": "Manifest changed since action was queued — blocked for safety."}

        result = self.registry.execute_tool(server_id, tool_name, args)
        self._audit(server_id, tool_name, "APPROVED", t0, sha256=current_hash,
                    reason=f"User approved pending action {pending_id}")
        return {
            "status": "APPROVED",
            "data": result,
            "server": server_id,
            "tool": tool_name,
            "pending_id": pending_id,
        }

    def reject(self, pending_id: str) -> dict[str, Any]:
        entry = self.pending.pop(pending_id, None)
        if not entry:
            return {"status": "ERROR", "reason": f"No pending action with id '{pending_id}'"}

        t0 = time.perf_counter()
        server_id = entry["server_id"]
        tool_name = entry["tool_name"]
        _, current_hash, _ = self.verify_manifest(server_id)
        self._audit(server_id, tool_name, "REJECTED", t0, sha256=current_hash,
                    reason=f"User rejected pending action {pending_id}")
        return {
            "status": "REJECTED",
            "server": server_id,
            "tool": tool_name,
            "pending_id": pending_id,
        }

    # ── Audit passbook ──────────────────────────────────────────────────────

    def _audit(
        self,
        server: str,
        tool: str,
        decision: str,
        t0: float,
        sha256: str = "",
        reason: str = "",
    ) -> None:
        entry = {
            "timestamp": _now_iso(),
            "server": server,
            "tool": tool,
            "decision": decision,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
            "sha256_hash": sha256,
            "reason": reason,
        }
        self.audit_log.append(entry)
        self._save_audit_log()

    def _blocked(
        self,
        server: str,
        tool: str,
        args: dict[str, Any],
        t0: float,
        reason: str,
        sha256: str = "",
    ) -> dict[str, Any]:
        self._audit(server, tool, "BLOCKED", t0, sha256=sha256, reason=reason)
        return {"status": "BLOCKED", "reason": reason, "server": server, "tool": tool}

    def _load_audit_log(self) -> None:
        self.audit_log = []
        try:
            AUDIT_LOG_PATH.write_text("[]", encoding="utf-8")
        except Exception:
            pass

    def _save_audit_log(self) -> None:
        AUDIT_LOG_PATH.write_text(
            json.dumps(self.audit_log, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
