#!/usr/bin/env python3
"""Seed Shopify metaobjects for comuna-based shipping logic.

This helper is local-only tooling. It is not loaded by the Shopify theme.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request
from xml.etree import ElementTree as ET
from zipfile import ZipFile


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = REPO_ROOT.parent / "Baumart-source" / "Comunas.xlsx"
DEFAULT_OUTPUT = Path(__file__).with_name("seed-preview.json")
DEFAULT_API_VERSION = "2026-01"
GRAPHQL_ENDPOINT_TEMPLATE = "https://{store}/admin/api/{version}/graphql.json"
XML_NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

DEFAULT_REGION_NAME = "Región Metropolitana de Santiago"
DEFAULT_COMUNA_NAME = "Santiago"


DEFINITION_SPECS = [
    {
        "type": "shipping_region",
        "name": "Shipping Region",
        "fields": [
            {"key": "name", "name": "Name", "type": "single_line_text_field", "required": True},
            {"key": "slug", "name": "Slug", "type": "single_line_text_field", "required": True},
            {"key": "active", "name": "Active", "type": "boolean", "required": False},
            {
                "key": "default_free_shipping_threshold",
                "name": "Default Free Shipping Threshold",
                "type": "number_integer",
                "required": False,
            },
            {"key": "sort_order", "name": "Sort Order", "type": "number_integer", "required": False},
        ],
    },
    {
        "type": "shipping_comuna",
        "name": "Shipping Comuna",
        "fields": [
            {"key": "name", "name": "Name", "type": "single_line_text_field", "required": True},
            {"key": "slug", "name": "Slug", "type": "single_line_text_field", "required": True},
            {"key": "active", "name": "Active", "type": "boolean", "required": False},
            {
                "key": "region",
                "name": "Region",
                "type": "metaobject_reference",
                "required": True,
                "validations": [{"name": "metaobject_definition_id", "value": "shipping_region"}],
            },
            {
                "key": "free_shipping_threshold_override",
                "name": "Free Shipping Threshold Override",
                "type": "number_integer",
                "required": False,
            },
            {"key": "eta_min_days", "name": "ETA Min Days", "type": "number_integer", "required": False},
            {"key": "eta_max_days", "name": "ETA Max Days", "type": "number_integer", "required": False},
            {
                "key": "estimated_shipping_cost",
                "name": "Estimated Shipping Cost",
                "type": "number_integer",
                "required": False,
            },
        ],
    },
    {
        "type": "shipping_settings",
        "name": "Shipping Settings",
        "fields": [
            {"key": "enabled", "name": "Enabled", "type": "boolean", "required": False},
            {"key": "popup_enabled", "name": "Popup Enabled", "type": "boolean", "required": False},
            {
                "key": "popup_delay_seconds",
                "name": "Popup Delay Seconds",
                "type": "number_integer",
                "required": False,
            },
            {
                "key": "default_region",
                "name": "Default Region",
                "type": "metaobject_reference",
                "required": True,
                "validations": [{"name": "metaobject_definition_id", "value": "shipping_region"}],
            },
            {
                "key": "default_comuna",
                "name": "Default Comuna",
                "type": "metaobject_reference",
                "required": True,
                "validations": [{"name": "metaobject_definition_id", "value": "shipping_comuna"}],
            },
            {
                "key": "global_free_shipping_threshold",
                "name": "Global Free Shipping Threshold",
                "type": "number_integer",
                "required": False,
            },
        ],
    },
]


@dataclass(frozen=True)
class RegionRecord:
    name: str
    slug: str
    sort_order: int
    active: bool = True


@dataclass(frozen=True)
class ComunaRecord:
    name: str
    slug: str
    region_name: str
    region_slug: str
    active: bool = True


class ShopifyGraphQLError(RuntimeError):
    """Raised when the Shopify Admin API returns GraphQL or transport errors."""


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    if not slug:
        raise ValueError(f"Cannot build slug from value: {value!r}")
    return slug


def parse_xlsx_rows(path: Path) -> list[list[str]]:
    with ZipFile(path) as workbook:
        shared_strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared_root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("main:si", XML_NS):
                fragments = [node.text or "" for node in item.findall(".//main:t", XML_NS)]
                shared_strings.append("".join(fragments))

        sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in sheet.findall(".//main:sheetData/main:row", XML_NS):
            values: list[str] = []
            for cell in row.findall("main:c", XML_NS):
                cell_value = cell.find("main:v", XML_NS)
                if cell_value is None:
                    values.append("")
                    continue
                if cell.get("t") == "s":
                    values.append(shared_strings[int(cell_value.text)])
                else:
                    values.append(cell_value.text or "")
            rows.append(values)
        return rows


def build_seed_data(path: Path) -> tuple[list[RegionRecord], list[ComunaRecord]]:
    rows = parse_xlsx_rows(path)
    data_rows = [row for row in rows[3:] if len(row) >= 3 and row[0] and row[1]]
    if not data_rows:
        raise ValueError(f"No comuna rows found in workbook: {path}")

    regions: list[RegionRecord] = []
    comunas: list[ComunaRecord] = []
    seen_regions: dict[str, RegionRecord] = {}
    seen_comunas: set[str] = set()

    for row in data_rows:
        comuna_name = row[0].strip()
        region_name = row[1].strip()

        region_slug = slugify(region_name)
        if region_name not in seen_regions:
            region = RegionRecord(name=region_name, slug=region_slug, sort_order=len(seen_regions) + 1)
            seen_regions[region_name] = region
            regions.append(region)

        comuna_slug = slugify(comuna_name)
        if comuna_slug in seen_comunas:
            raise ValueError(f"Duplicate comuna slug generated for {comuna_name!r}: {comuna_slug}")
        seen_comunas.add(comuna_slug)

        comunas.append(
            ComunaRecord(
                name=comuna_name,
                slug=comuna_slug,
                region_name=region_name,
                region_slug=region_slug,
            )
        )

    return regions, comunas


def build_preview_payload(input_path: Path, regions: list[RegionRecord], comunas: list[ComunaRecord]) -> dict[str, Any]:
    default_region = next((region for region in regions if region.name == DEFAULT_REGION_NAME), None)
    default_comuna = next((comuna for comuna in comunas if comuna.name == DEFAULT_COMUNA_NAME), None)
    if default_region is None or default_comuna is None:
        raise ValueError("Default region/comuna could not be found in the parsed dataset.")

    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_path": str(input_path),
        "summary": {
            "region_count": len(regions),
            "comuna_count": len(comunas),
        },
        "defaults": {
            "region_name": default_region.name,
            "region_slug": default_region.slug,
            "comuna_name": default_comuna.name,
            "comuna_slug": default_comuna.slug,
        },
        "regions": [
            {
                "name": region.name,
                "slug": region.slug,
                "active": region.active,
                "default_free_shipping_threshold": None,
                "sort_order": region.sort_order,
            }
            for region in regions
        ],
        "comunas": [
            {
                "name": comuna.name,
                "slug": comuna.slug,
                "region_name": comuna.region_name,
                "region_slug": comuna.region_slug,
                "active": comuna.active,
                "free_shipping_threshold_override": None,
                "eta_min_days": None,
                "eta_max_days": None,
                "estimated_shipping_cost": None,
            }
            for comuna in comunas
        ],
    }


class ShopifyAdminClient:
    def __init__(self, store: str, token: str, api_version: str) -> None:
        self.endpoint = GRAPHQL_ENDPOINT_TEMPLATE.format(store=store, version=api_version)
        self.token = token

    def execute(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
        req = request.Request(
            self.endpoint,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": self.token,
            },
        )
        try:
            with request.urlopen(req) as response:
                body = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise ShopifyGraphQLError(f"HTTP {exc.code}: {detail}") from exc
        except error.URLError as exc:
            raise ShopifyGraphQLError(f"Network error: {exc}") from exc

        data = json.loads(body)
        if data.get("errors"):
            raise ShopifyGraphQLError(json.dumps(data["errors"], ensure_ascii=False, indent=2))
        return data["data"]


DEFINITION_BY_TYPE_QUERY = """
query DefinitionByType($type: String!) {
  metaobjectDefinitionByType(type: $type) {
    id
    name
    type
    fieldDefinitions {
      key
      name
      required
      type {
        name
      }
      validations {
        name
        value
      }
    }
  }
}
"""


DEFINITION_CREATE_MUTATION = """
mutation CreateDefinition($definition: MetaobjectDefinitionCreateInput!) {
  metaobjectDefinitionCreate(definition: $definition) {
    metaobjectDefinition {
      id
      type
      name
    }
    userErrors {
      field
      message
      code
    }
  }
}
"""


DEFINITION_UPDATE_MUTATION = """
mutation UpdateDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
  metaobjectDefinitionUpdate(id: $id, definition: $definition) {
    metaobjectDefinition {
      id
      type
      name
    }
    userErrors {
      field
      message
      code
    }
  }
}
"""


METAOBJECTS_QUERY = """
query MetaobjectsByType($type: String!, $cursor: String) {
  metaobjects(type: $type, first: 250, after: $cursor) {
    edges {
      cursor
      node {
        id
        handle
        type
        fields {
          key
          value
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
"""


METAOBJECT_CREATE_MUTATION = """
mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
  metaobjectCreate(metaobject: $metaobject) {
    metaobject {
      id
      handle
      type
    }
    userErrors {
      field
      message
      code
    }
  }
}
"""


METAOBJECT_UPDATE_MUTATION = """
mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
  metaobjectUpdate(id: $id, metaobject: $metaobject) {
    metaobject {
      id
      handle
      type
    }
    userErrors {
      field
      message
      code
    }
  }
}
"""


def ensure_no_user_errors(payload: dict[str, Any], key: str) -> dict[str, Any]:
    errors = payload[key]["userErrors"]
    if errors:
        raise ShopifyGraphQLError(json.dumps(errors, ensure_ascii=False, indent=2))
    return payload[key]


def normalize_definition_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for field in fields:
        item = {
            "key": field["key"],
            "name": field["name"],
            "type": field["type"],
            "required": field.get("required", False),
        }
        if field.get("validations"):
            item["validations"] = field["validations"]
        normalized.append(item)
    return normalized


def definition_requires_update(existing: dict[str, Any], spec: dict[str, Any]) -> bool:
    existing_fields = {field["key"]: field for field in existing.get("fieldDefinitions", [])}
    for expected in spec["fields"]:
        current = existing_fields.get(expected["key"])
        if current is None:
            return True
        current_type = current.get("type", {}).get("name") or current.get("type")
        if current_type != expected["type"]:
            return True
        if bool(current.get("required")) != bool(expected.get("required", False)):
            return True
        expected_validations = expected.get("validations", [])
        current_validations = current.get("validations") or []
        if sorted(expected_validations, key=lambda item: (item["name"], item["value"])) != sorted(
            current_validations, key=lambda item: (item["name"], item["value"])
        ):
            return True
    return False


def ensure_definitions(client: ShopifyAdminClient) -> None:
    for spec in DEFINITION_SPECS:
        existing = client.execute(DEFINITION_BY_TYPE_QUERY, {"type": spec["type"]})["metaobjectDefinitionByType"]
        payload = {
            "name": spec["name"],
            "type": spec["type"],
            "fieldDefinitions": normalize_definition_fields(spec["fields"]),
        }
        if existing is None:
            result = client.execute(DEFINITION_CREATE_MUTATION, {"definition": payload})
            ensure_no_user_errors(result, "metaobjectDefinitionCreate")
            print(f"[apply] created definition: {spec['type']}")
            continue
        if definition_requires_update(existing, spec):
            result = client.execute(DEFINITION_UPDATE_MUTATION, {"id": existing["id"], "definition": payload})
            ensure_no_user_errors(result, "metaobjectDefinitionUpdate")
            print(f"[apply] updated definition: {spec['type']}")
        else:
            print(f"[apply] definition unchanged: {spec['type']}")


def load_existing_metaobjects(client: ShopifyAdminClient, metaobject_type: str) -> dict[str, dict[str, Any]]:
    items: dict[str, dict[str, Any]] = {}
    cursor: str | None = None
    while True:
        result = client.execute(METAOBJECTS_QUERY, {"type": metaobject_type, "cursor": cursor})["metaobjects"]
        for edge in result["edges"]:
            node = edge["node"]
            items[node["handle"]] = node
        if not result["pageInfo"]["hasNextPage"]:
            break
        cursor = result["pageInfo"]["endCursor"]
    return items


def serialize_field_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def build_fields(field_map: dict[str, Any]) -> list[dict[str, str]]:
    fields = []
    for key, value in field_map.items():
        if value is None:
            continue
        fields.append({"key": key, "value": serialize_field_value(value)})
    return fields


def create_or_update_metaobject(
    client: ShopifyAdminClient,
    existing: dict[str, dict[str, Any]],
    metaobject_type: str,
    handle: str,
    field_map: dict[str, Any],
) -> dict[str, Any]:
    fields = build_fields(field_map)
    current = existing.get(handle)
    if current is None:
        result = client.execute(
            METAOBJECT_CREATE_MUTATION,
            {"metaobject": {"type": metaobject_type, "handle": handle, "fields": fields}},
        )
        response = ensure_no_user_errors(result, "metaobjectCreate")
        created = response["metaobject"]
        existing[handle] = {"id": created["id"], "handle": handle, "fields": fields}
        return created

    current_fields = {field["key"]: field["value"] for field in current.get("fields", [])}
    next_fields = {field["key"]: field["value"] for field in fields}
    if current_fields == next_fields:
        return current

    result = client.execute(
        METAOBJECT_UPDATE_MUTATION,
        {"id": current["id"], "metaobject": {"fields": fields}},
    )
    response = ensure_no_user_errors(result, "metaobjectUpdate")
    updated = response["metaobject"]
    existing[handle] = {"id": current["id"], "handle": handle, "fields": fields}
    return updated


def apply_seed(client: ShopifyAdminClient, regions: list[RegionRecord], comunas: list[ComunaRecord]) -> None:
    ensure_definitions(client)

    existing_regions = load_existing_metaobjects(client, "shipping_region")
    existing_comunas = load_existing_metaobjects(client, "shipping_comuna")
    existing_settings = load_existing_metaobjects(client, "shipping_settings")

    region_ids: dict[str, str] = {}
    for region in regions:
        result = create_or_update_metaobject(
            client,
            existing_regions,
            "shipping_region",
            region.slug,
            {
                "name": region.name,
                "slug": region.slug,
                "active": region.active,
                "sort_order": region.sort_order,
            },
        )
        region_ids[region.slug] = result["id"] if "id" in result else existing_regions[region.slug]["id"]
    print(f"[apply] ensured regions: {len(region_ids)}")

    comuna_ids: dict[str, str] = {}
    for comuna in comunas:
        region_id = region_ids[comuna.region_slug]
        result = create_or_update_metaobject(
            client,
            existing_comunas,
            "shipping_comuna",
            comuna.slug,
            {
                "name": comuna.name,
                "slug": comuna.slug,
                "active": comuna.active,
                "region": region_id,
            },
        )
        comuna_ids[comuna.slug] = result["id"] if "id" in result else existing_comunas[comuna.slug]["id"]
    print(f"[apply] ensured comunas: {len(comuna_ids)}")

    default_region_slug = slugify(DEFAULT_REGION_NAME)
    default_comuna_slug = slugify(DEFAULT_COMUNA_NAME)
    create_or_update_metaobject(
        client,
        existing_settings,
        "shipping_settings",
        "shipping-settings",
        {
            "enabled": False,
            "popup_enabled": True,
            "popup_delay_seconds": 3,
            "default_region": region_ids[default_region_slug],
            "default_comuna": comuna_ids[default_comuna_slug],
        },
    )
    print("[apply] ensured singleton settings: shipping-settings")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Shopify metaobjects for comuna shipping data.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Path to Comunas.xlsx")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Path to seed-preview.json")
    parser.add_argument("--dry-run", action="store_true", help="Parse workbook and write preview JSON only.")
    parser.add_argument("--apply", action="store_true", help="Create/update Shopify definitions and metaobjects.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.dry_run and not args.apply:
        print("Choose at least one action: --dry-run and/or --apply", file=sys.stderr)
        return 1

    if not args.input.exists():
        print(f"Input workbook not found: {args.input}", file=sys.stderr)
        return 1

    try:
        regions, comunas = build_seed_data(args.input)
    except Exception as exc:  # pragma: no cover - surfaced in CLI output
        print(f"Failed to parse workbook: {exc}", file=sys.stderr)
        return 1

    payload = build_preview_payload(args.input, regions, comunas)

    if args.dry_run:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[dry-run] wrote preview: {args.output}")
        print(f"[dry-run] regions={len(regions)} comunas={len(comunas)}")
        print(
            "[dry-run] defaults="
            f"{payload['defaults']['region_name']} / {payload['defaults']['comuna_name']}"
        )

    if args.apply:
        store = os.getenv("SHOPIFY_STORE", "").strip()
        token = os.getenv("SHOPIFY_ADMIN_TOKEN", "").strip()
        version = os.getenv("SHOPIFY_API_VERSION", DEFAULT_API_VERSION).strip()
        if not store or not token:
            print(
                "SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN are required for --apply.",
                file=sys.stderr,
            )
            return 1

        try:
            client = ShopifyAdminClient(store=store, token=token, api_version=version)
            apply_seed(client, regions, comunas)
        except ShopifyGraphQLError as exc:
            print(f"Shopify Admin API error: {exc}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
