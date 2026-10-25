#!/usr/bin/env python3
"""Offline, read-only CRM migration planner.

This module deliberately has no network, Firebase/admin, dotenv, or writer imports.
It reads CSV snapshots, validates the Firestore contract, and emits private,
deterministic manifests for a separate writer to consume later.
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import decimal
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping

PROJECT = "ar-crm-73222"
WORKSPACE = "ar-crm-owner"
OWNER_UID = "MlJVDEJvxrhdlwX87OGED0VfD6t1"
SCHEMA_VERSION = 1
MAX_SAFE_INTEGER = 9007199254740991

LEAD_HEADERS = (
    "id", "company_name", "contact_person", "phone", "industry", "city",
    "pipeline_stage", "deal_value", "next_followup_date", "lead_score",
    "created_at", "updated_at",
)
ACTIVITY_HEADERS = (
    "id", "lead_id", "activity_type", "notes", "ai_summary",
    "location_gps", "created_at",
)
LEAD_PAYLOAD_KEYS = (
    "company_name", "contact_person", "phone", "industry", "city",
    "pipeline_stage", "deal_value", "next_followup_date", "lead_score",
    "ownerId", "role", "created_at", "updated_at",
)
ACTIVITY_PAYLOAD_KEYS = (
    "lead_id", "activity_type", "notes", "ownerId", "role", "created_at",
)
STAGES = frozenset(("Prospect", "Meeting", "Negotiation", "Closing Won", "Closing Lost"))
SCORES = frozenset(("Hot", "Warm", "Cold", "Unrated"))
LEGACY_LEAD_IDS = frozenset(("LEAD-101", "LEAD-102", "LEAD-103", "LEAD-104"))
LEGACY_ACTIVITY_IDS = frozenset(("ACT-201", "ACT-202"))
LEGACY_GLOBAL_IDS = frozenset(("GL-1", "GL-2", "GL-3", "GL-4", "GL-5"))
LEGACY_DUMMY_NAMES = frozenset((
    "pt nusantara logistics", "cv makmur sentosa", "pt digital solusi utama",
    "karya prima medika",
))
DECIMAL_RE = re.compile(r"^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")
DATE_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
TS_RE = re.compile(
    r"^(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2})T(?P<h>[0-9]{2}):(?P<m>[0-9]{2}):"
    r"(?P<s>[0-9]{2})(?:\.(?P<f>[0-9]{1,9}))?(?P<tz>Z|[+-][0-9]{2}:[0-9]{2})$"
)


class ValidationError(Exception):
    """Raised for an invalid or ambiguous migration snapshot."""


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_hash(value: Any) -> str:
    return sha256_bytes(_json(value).encode("utf-8"))


def _timestamp(value: str) -> tuple[str, tuple[int, int]]:
    match = TS_RE.fullmatch(value)
    if not match:
        raise ValidationError("invalid explicit-timezone timestamp")
    try:
        year, month, day = (int(x) for x in match.group("date").split("-"))
        hour, minute, second = int(match.group("h")), int(match.group("m")), int(match.group("s"))
        _dt.date(year, month, day)
    except ValueError as exc:
        raise ValidationError("invalid timestamp calendar value") from exc
    if hour > 23 or minute > 59 or second > 59:
        raise ValidationError("invalid timestamp clock value")
    fraction = (match.group("f") or "").ljust(9, "0")
    nanos = int(fraction or "0")
    offset = 0 if match.group("tz") == "Z" else (
        (1 if match.group("tz")[0] == "+" else -1) *
        (int(match.group("tz")[1:3]) * 3600 + int(match.group("tz")[4:]) * 60)
    )
    if offset and (int(match.group("tz")[1:3]) > 23 or int(match.group("tz")[4:]) > 59):
        raise ValidationError("invalid timezone offset")
    try:
        base = _dt.datetime(year, month, day, hour, minute, second, tzinfo=_dt.timezone.utc)
        epoch_seconds = int(base.timestamp()) - offset
        canonical_dt = _dt.datetime.fromtimestamp(epoch_seconds, tz=_dt.timezone.utc)
    except (ValueError, OverflowError, OSError) as exc:
        raise ValidationError("timestamp outside supported UTC range") from exc
    canonical = (f"{canonical_dt.year:04d}-{canonical_dt.month:02d}-{canonical_dt.day:02d}"
                 f"T{canonical_dt.hour:02d}:{canonical_dt.minute:02d}:{canonical_dt.second:02d}"
                 f".{nanos:09d}Z")
    return canonical, (epoch_seconds, nanos)


def _date(value: str) -> str:
    if value == "":
        return value
    if not DATE_RE.fullmatch(value):
        raise ValidationError("invalid follow-up date")
    try:
        _dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError("invalid follow-up calendar date") from exc
    return value


def _id(value: str) -> str:
    if not value or value != value.strip() or len(value) > 150 or "/" in value or value in (".", ".."):
        raise ValidationError("unsafe document ID")
    if value == "__name__" or (value.startswith("__") and value.endswith("__")):
        raise ValidationError("reserved document ID")
    return value


def _deal(value: str) -> int | float:
    if not DECIMAL_RE.fullmatch(value):
        raise ValidationError("deal value is not an unambiguous nonnegative decimal")
    number = decimal.Decimal(value)
    if number > decimal.Decimal(MAX_SAFE_INTEGER):
        raise ValidationError("deal value exceeds safe JavaScript integer range")
    if number == number.to_integral_value():
        return int(number)
    result = float(number)
    if not (result >= 0 and result < float("inf")) or decimal.Decimal(str(result)) != number:
        raise ValidationError("deal value cannot be represented safely as a finite JavaScript number")
    return result


def _read_csv(path: Path, expected: tuple[str, ...]) -> tuple[list[dict[str, str]], str]:
    raw = path.read_bytes()
    digest = sha256_bytes(raw)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError("source is not UTF-8") from exc
    reader = csv.DictReader(text.splitlines(keepends=True))
    if tuple(reader.fieldnames or ()) != expected:
        raise ValidationError("source headers do not exactly match schema")
    rows: list[dict[str, str]] = []
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValidationError("source contains malformed CSV fields")
        rows.append({key: row[key] for key in expected})
    return rows, digest


def _record(record_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    item = {"id": record_id, "payload": payload}
    return {"id": record_id, "payload": payload, "sha256": canonical_hash(item)}


def _legacy(row: Mapping[str, str], category: str) -> bool:
    rid = row["id"]
    if category == "lead":
        return rid in LEGACY_LEAD_IDS or row["company_name"].lower().strip() in LEGACY_DUMMY_NAMES
    if category == "activity":
        return rid in LEGACY_ACTIVITY_IDS or row["lead_id"] in LEGACY_LEAD_IDS
    return rid in LEGACY_GLOBAL_IDS


def build_plan(leads_path: str | os.PathLike[str], activities_path: str | os.PathLike[str],
               project: str = PROJECT, workspace: str = WORKSPACE, owner: str = OWNER_UID) -> dict[str, Any]:
    """Build a deterministic, read-only migration plan from two CSV snapshots."""
    if (project, workspace, owner) != (PROJECT, WORKSPACE, OWNER_UID):
        raise ValidationError("target bindings are not on the hard allowlist")
    lead_rows, leads_sha = _read_csv(Path(leads_path), LEAD_HEADERS)
    activity_rows, activities_sha = _read_csv(Path(activities_path), ACTIVITY_HEADERS)
    errors: list[str] = []
    quarantined = {"leads": 0, "activities": 0}
    rejected = {"leads": 0, "activities": 0}
    excluded = {"ai_summary_nonempty": 0, "location_gps_nonempty": 0}
    seen: set[str] = set()
    lead_records: list[dict[str, Any]] = []
    lead_times: dict[str, tuple[int, int]] = {}
    for row in lead_rows:
        try:
            rid = _id(row["id"])
            if rid in seen: raise ValidationError("duplicate document ID")
            seen.add(rid)
            if _legacy(row, "lead"):
                quarantined["leads"] += 1
                continue
            created, ckey = _timestamp(row["created_at"])
            updated, ukey = _timestamp(row["updated_at"])
            if ukey < ckey: raise ValidationError("updated timestamp precedes created timestamp")
            if row["pipeline_stage"] not in STAGES: raise ValidationError("unknown pipeline stage")
            if row["lead_score"] not in SCORES: raise ValidationError("unknown lead score")
            if not row["company_name"] or len(row["company_name"]) > 200: raise ValidationError("company name bounds")
            if len(row["contact_person"]) > 200 or len(row["industry"]) > 120 or len(row["city"]) > 120: raise ValidationError("lead string bounds")
            payload = {"company_name": row["company_name"], "contact_person": row["contact_person"], "phone": row["phone"], "industry": row["industry"], "city": row["city"], "pipeline_stage": row["pipeline_stage"], "deal_value": _deal(row["deal_value"]), "next_followup_date": _date(row["next_followup_date"]), "lead_score": row["lead_score"], "ownerId": owner, "role": "owner", "created_at": {"$timestamp": created}, "updated_at": {"$timestamp": updated}}
            lead_records.append(_record(rid, payload)); lead_times[rid] = ckey
        except ValidationError as exc:
            rejected["leads"] += 1
            errors.append(f"lead:{exc}")
    activity_records: list[dict[str, Any]] = []
    for row in activity_rows:
        try:
            rid = _id(row["id"])
            if rid in seen: raise ValidationError("duplicate document ID")
            seen.add(rid)
            if _legacy(row, "activity"):
                quarantined["activities"] += 1
                continue
            if row["lead_id"] not in lead_times: raise ValidationError("orphan activity")
            created, _ = _timestamp(row["created_at"])
            if not row["activity_type"] or len(row["activity_type"]) > 80 or len(row["notes"]) > 12000: raise ValidationError("activity string bounds")
            if row["ai_summary"]: excluded["ai_summary_nonempty"] += 1
            if row["location_gps"]: excluded["location_gps_nonempty"] += 1
            payload = {"lead_id": row["lead_id"], "activity_type": row["activity_type"], "notes": row["notes"], "ownerId": owner, "role": "owner", "created_at": {"$timestamp": created}}
            activity_records.append(_record(rid, payload))
        except ValidationError as exc:
            rejected["activities"] += 1
            errors.append(f"activity:{exc}")
    lead_records.sort(key=lambda x: x["id"]); activity_records.sort(key=lambda x: x["id"])
    counts = {
        "source_leads": len(lead_rows), "source_activities": len(activity_rows),
        "planned_leads": len(lead_records), "planned_activities": len(activity_records),
        "quarantined_leads": quarantined["leads"], "quarantined_activities": quarantined["activities"],
        "rejected_leads": rejected["leads"], "rejected_activities": rejected["activities"],
        "excluded_nonempty_ai_summary": excluded["ai_summary_nonempty"],
        "excluded_nonempty_location_gps": excluded["location_gps_nonempty"],
        "validation_errors": len(errors),
    }
    reconciliation = {
        "leads": len(lead_rows) == len(lead_records) + quarantined["leads"] + rejected["leads"],
        "activities": len(activity_rows) == len(activity_records) + quarantined["activities"] + rejected["activities"],
    }
    if not all(reconciliation.values()):
        raise ValidationError("source category reconciliation failed")
    return {"manifest_version": SCHEMA_VERSION, "target": {"project": project, "workspace": workspace, "ownerId": owner, "collections": {"leads": "leads", "activities": "activities"}}, "source_sha256": {"leads": leads_sha, "activities": activities_sha}, "records": {"leads": lead_records, "activities": activity_records}, "category_counts": counts, "reconciliation": reconciliation, "quarantine": {"legacy_signatures": quarantined, "errors": len(errors)}, "excluded_activity_fields": excluded, "validation_error_kinds": sorted(set(errors))}


def write_outputs(plan: dict[str, Any], output_dir: str | os.PathLike[str]) -> tuple[Path, Path, str]:
    """Write only private 700/600 plan and summary files; return their paths and plan hash."""
    out = Path(output_dir).resolve()
    repo = Path(__file__).resolve().parents[1]
    if out == repo or repo in out.parents:
        raise ValidationError("output directory must be outside the repository")
    out.mkdir(parents=True, exist_ok=True)
    os.chmod(out, 0o700)
    body = _json(plan).encode("utf-8")
    plan_hash = sha256_bytes(body)
    plan_doc = dict(plan); plan_doc["plan_sha256"] = plan_hash
    summary = {"manifest_version": SCHEMA_VERSION, "plan_sha256": plan_hash, "category_counts": plan["category_counts"], "reconciliation": plan["reconciliation"], "quarantine": plan["quarantine"], "excluded_activity_fields": plan["excluded_activity_fields"], "status": "blocked" if plan["quarantine"]["errors"] or any(plan["quarantine"]["legacy_signatures"].values()) else "ready-dry-run"}
    plan_file, summary_file = out / "plan.json", out / "dry-run-summary.json"
    for path, value in ((plan_file, plan_doc), (summary_file, summary)):
        with path.open("w", encoding="utf-8", newline="\n") as handle: handle.write(_json(value) + "\n")
        os.chmod(path, 0o600)
    return plan_file, summary_file, plan_hash


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Offline read-only CRM migration planner")
    parser.add_argument("--leads", required=True); parser.add_argument("--activities", required=True); parser.add_argument("--output-dir", required=True)
    parser.add_argument("--project", default=PROJECT); parser.add_argument("--workspace", default=WORKSPACE); parser.add_argument("--owner", default=OWNER_UID)
    parser.add_argument("--apply", action="store_true", help="always rejected; no writer is implemented")
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.apply:
        print("ERROR apply_not_available; dry-run only", file=sys.stderr); return 2
    try:
        plan = build_plan(args.leads, args.activities, args.project, args.workspace, args.owner)
        plan_file, summary_file, plan_hash = write_outputs(plan, args.output_dir)
    except (OSError, ValidationError, csv.Error) as exc:
        print(f"ERROR migration_blocked reason={type(exc).__name__}", file=sys.stderr); return 2
    blocked = plan["quarantine"]["errors"] or any(plan["quarantine"]["legacy_signatures"].values())
    c = plan["category_counts"]
    print(f"status={'blocked' if blocked else 'ready-dry-run'} leads={c['planned_leads']}/{c['source_leads']} activities={c['planned_activities']}/{c['source_activities']} errors={c['validation_errors']} quarantined={c['quarantined_leads'] + c['quarantined_activities']} excluded={c['excluded_nonempty_ai_summary'] + c['excluded_nonempty_location_gps']} plan_sha256={plan_hash} files=2")
    return 2 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
