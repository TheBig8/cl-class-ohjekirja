#!/usr/bin/env python3
"""
Translate a raw English batch JSON → Finnish pages JSON.

Usage:
  python3 scripts/translate-batch.py --raw data/raw/011-020.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parents[1]
PAGES_DIR = ROOT / "data" / "pages"
META_PATH = ROOT / "data" / "meta.json"

translator = GoogleTranslator(source="en", target="fi")

# Keep common Mercedes terms readable
TERM_FIXES = [
    (r"\bCOMAND\b", "COMAND"),
    (r"\bSmartKey\b", "SmartKey"),
    (r"\bKEYLESS-GO\b", "KEYLESS-GO"),
    (r"\bPRE-SAFE\b", "PRE-SAFE"),
    (r"\bDISTRONIC\b", "DISTRONIC"),
    (r"\bESP\b", "ESP"),
    (r"\bABS\b", "ABS"),
    (r"\bBAS\b", "BAS"),
    (r"\bAMG\b", "AMG"),
    (r"\bBluetooth\b", "Bluetooth"),
]


def chunk_text(text: str, limit: int = 4500) -> list[str]:
    """Split long text on paragraph boundaries for translator limits."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= limit:
        return [text]
    parts: list[str] = []
    buf: list[str] = []
    size = 0
    for para in re.split(r"(\n\n+)", text):
        if size + len(para) > limit and buf:
            parts.append("".join(buf).strip())
            buf = [para]
            size = len(para)
        else:
            buf.append(para)
            size += len(para)
    if buf:
        parts.append("".join(buf).strip())
    return [p for p in parts if p]


def translate_text(text: str) -> str:
    if not text or not text.strip():
        return ""
    out_chunks = []
    for chunk in chunk_text(text):
        for attempt in range(4):
            try:
                translated = translator.translate(chunk)
                out_chunks.append(translated or chunk)
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 3:
                    print(f"  translate failed, keeping EN: {exc}", file=sys.stderr)
                    out_chunks.append(chunk)
                else:
                    time.sleep(1.2 * (attempt + 1))
        time.sleep(0.15)
    result = "\n\n".join(out_chunks)
    for pattern, repl in TERM_FIXES:
        result = re.sub(pattern, repl, result, flags=re.IGNORECASE)
    return result.strip()


def guess_section(title_fi: str, fi: str) -> str:
    hay = f"{title_fi}\n{fi[:200]}".lower()
    rules = [
        ("sisällysluettelo", "Sisällysluettelo"),
        ("contents", "Sisällysluettelo"),
        ("johdanto", "Johdanto"),
        ("introduction", "Johdanto"),
        ("turvallisuus", "Turvallisuus"),
        ("safety", "Turvallisuus"),
        ("comand", "COMAND"),
        ("navigointi", "Navigointi"),
        ("navigation", "Navigointi"),
        ("ilmastointi", "Ilmastointi"),
        ("climate", "Ilmastointi"),
        ("rengas", "Renkaat"),
        ("tire", "Renkaat"),
        ("tyre", "Renkaat"),
        ("huolto", "Huolto"),
        ("maintenance", "Huolto"),
        ("akun", "Akku"),
        ("battery", "Akku"),
        ("ovien", "Lukitus"),
        ("locking", "Lukitus"),
        ("istuin", "Istuimet"),
        ("seat", "Istuimet"),
    ]
    for needle, section in rules:
        if needle in hay:
            return section
    return "Ohje"


def pad(n: int) -> str:
    return f"{n:03d}"


def clean_en(text: str) -> str:
    """Join PDF hyphenation artifacts: 'demon-\\n stration' → 'demonstration'."""
    text = re.sub(r"(\w)-\n\s*", r"\1", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Mercedes manual bullet glyph
    text = text.replace("앫", "•")
    return text.strip()


def translate_page(item: dict) -> dict | None:
    page = item.get("page")
    if item.get("status") == "missing" or not item.get("en"):
        return {
            "page": page,
            "section": "Ohje",
            "titleFi": f"Sivu {page}",
            "fi": "",
            "sourceUrl": item.get("sourceUrl"),
            "imageUrl": item.get("imageUrl"),
            "originalPath": item.get("originalPath") or f"original/{pad(page)}.html",
            "missing": True,
        }

    en = clean_en(item["en"])
    title_en = clean_en(item.get("title") or en.split("\n", 1)[0])
    print(f"  translating page {page}…", file=sys.stderr)
    title_fi = translate_text(title_en) or title_en
    fi = translate_text(en)
    return {
        "page": page,
        "section": guess_section(title_fi, fi),
        "titleFi": title_fi[:120],
        "fi": fi,
        "sourceUrl": item.get("sourceUrl"),
        "imageUrl": item.get("imageUrl"),
        "originalPath": item.get("originalPath") or f"original/{pad(page)}.html",
    }


def update_meta(batch_name: str, to_page: int) -> None:
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    batches = meta.get("batches") or []
    if batch_name not in batches:
        batches.append(batch_name)
        batches.sort()
    meta["batches"] = batches
    meta["lastBatch"] = batch_name
    # count translated pages from all batch files
    total = 0
    for name in batches:
        path = PAGES_DIR / name
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        total += sum(1 for p in data.get("pages", []) if p.get("fi"))
    meta["translatedPages"] = total
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", required=True, help="Path to data/raw/NNN-MMM.json")
    args = parser.parse_args()
    raw_path = Path(args.raw)
    if not raw_path.is_absolute():
        raw_path = ROOT / raw_path
    data = json.loads(raw_path.read_text(encoding="utf-8"))
    from_page = data["from"]
    to_page = data["to"]
    out_name = f"{pad(from_page)}-{pad(to_page)}.json"
    out_path = PAGES_DIR / out_name
    PAGES_DIR.mkdir(parents=True, exist_ok=True)

    pages = []
    for item in data.get("pages", []):
        pages.append(translate_page(item))

    payload = {"from": from_page, "to": to_page, "pages": pages}
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_meta(out_name, to_page)
    print(out_path)


if __name__ == "__main__":
    main()
