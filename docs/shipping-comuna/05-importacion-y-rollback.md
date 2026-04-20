# Importacion y Rollback

## Importacion inicial

### Requisitos
- App custom instalada en Shopify.
- Scopes:
  - `read_metaobject_definitions`
  - `write_metaobject_definitions`
  - `read_metaobjects`
  - `write_metaobjects`
- Variables de entorno:
  - `SHOPIFY_STORE`
  - `SHOPIFY_ADMIN_TOKEN`
  - `SHOPIFY_API_VERSION`

### Dry run
```powershell
python .\tools\shipping-comuna\import_metaobjects.py --dry-run
```

Validaciones esperadas:
- `16` regiones
- `346` comunas
- default `Region Metropolitana de Santiago / Santiago`

### Apply
```powershell
$env:SHOPIFY_STORE="baumart-cl.myshopify.com"
$env:SHOPIFY_ADMIN_TOKEN="TOKEN"
$env:SHOPIFY_API_VERSION="2026-04"

python .\tools\shipping-comuna\import_metaobjects.py --apply
```

### Verificacion posterior
1. `Settings > Custom data > Metaobjects`
2. Confirmar definiciones:
   - `shipping_region`
   - `shipping_comuna`
   - `shipping_settings`
3. Confirmar conteos:
   - `16` regiones
   - `346` comunas
   - `1` settings

## Rollback funcional

### Rollback rapido
Usar cuando hay conflicto visual o funcional en storefront.

1. Ir al theme activo.
2. Apagar `Enable comuna shipping logic`.
3. Guardar.

Efecto:
- se desactiva selector, badges dinamicos y cart progress comuna-aware.
- se conserva toda la configuracion de metaobjects.

### Rollback de theme
Usar cuando el problema no se resuelve con el kill switch.

1. Publicar el backup del theme previamente duplicado.
2. O volver al commit anterior en el theme de desarrollo.

## Rollback de datos
Normalmente no es necesario borrar datos.

Si se requiere:
1. Desactivar el feature toggle.
2. Corregir los metaobjects manualmente o volver a ejecutar el seeder con los datos correctos.

No se recomienda borrar definiciones salvo que el proyecto sea desinstalado por completo.

## Orden recomendado ante incidente
1. Apagar el toggle del theme.
2. Confirmar que el storefront vuelve al comportamiento anterior.
3. Revisar logs, cambios de theme y metaobjects.
4. Corregir en dev theme.
5. Reprobar con el checklist QA.
6. Reactivar solo cuando la validacion este cerrada.
