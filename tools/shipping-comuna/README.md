# Shipping Comuna Seed Helper

This helper seeds the Shopify Admin metaobjects needed for the comuna-based free shipping feature.

It is local tooling only. Nothing in this folder is loaded by the storefront theme.

## Files
- `import_metaobjects.py`: parses `Comunas.xlsx`, writes a reviewable preview JSON, and can create/update Shopify metaobject definitions and entries
- `seed-preview.json`: generated output from `--dry-run`, committed for review/debugging

## Required Admin API Access
Use a custom app Admin API token with these scopes:
- `read_metaobject_definitions`
- `write_metaobject_definitions`
- `read_metaobjects`
- `write_metaobjects`

## Environment Variables
- `SHOPIFY_STORE`: shop domain, for example `baumart-cl.myshopify.com`
- `SHOPIFY_ADMIN_TOKEN`: Admin API token from the custom app
- `SHOPIFY_API_VERSION`: optional, defaults to `2026-01`

## Input Workbook
By default the script reads:

```text
../Baumart-source/Comunas.xlsx
```

relative to the repo root.

You can override it with `--input`.

## Dry Run
Parse the workbook and write a preview file without calling Shopify:

```powershell
python .\tools\shipping-comuna\import_metaobjects.py --dry-run
```

Custom input/output:

```powershell
python .\tools\shipping-comuna\import_metaobjects.py `
  --dry-run `
  --input "F:\Workana\Baumart-source\Comunas.xlsx" `
  --output ".\tools\shipping-comuna\seed-preview.json"
```

Expected dry-run result:
- `16` regions
- `346` comunas
- default region `Región Metropolitana de Santiago`
- default comuna `Santiago`

## Apply to Shopify
Create or update the metaobject definitions and entries:

```powershell
$env:SHOPIFY_STORE = "baumart-cl.myshopify.com"
$env:SHOPIFY_ADMIN_TOKEN = "shpat_xxx"
python .\tools\shipping-comuna\import_metaobjects.py --apply
```

You can run both steps together:

```powershell
python .\tools\shipping-comuna\import_metaobjects.py --dry-run --apply
```

The script is idempotent:
- definitions are created if missing and updated if their field shape differs
- regions/comunas are matched by handle/slug
- `shipping_settings` is treated as a singleton with handle `shipping-settings`

## Metaobjects Created
- `shipping_region`
- `shipping_comuna`
- `shipping_settings`

## Verification in Shopify Admin
After `--apply`, verify:
1. `Settings > Custom data > Metaobjects` contains the three definitions above.
2. `shipping_region` has `16` entries.
3. `shipping_comuna` has `346` entries.
4. `shipping_settings` has one entry with:
   - `enabled = false`
   - `popup_enabled = true`
   - `popup_delay_seconds = 3`
   - default region `Región Metropolitana de Santiago`
   - default comuna `Santiago`

## Important
The theme toggle `enable_comuna_shipping_logic` must remain **off** after this foundation commit. Later feature commits will use these metaobjects, but this commit alone must not change storefront behavior.
