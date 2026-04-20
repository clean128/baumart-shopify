# Documentacion Tecnica

## Arquitectura general
La solucion se implementa como una capa de storefront sobre EURUS. No modifica checkout ni las reglas nativas de despacho.

## Componentes principales
- `assets/shipping-location-selector.js`
  Motor principal de ubicacion, persistencia, resolucion de umbrales y mensajeria.
- `assets/shipping-location-catalog.js`
  Catalogo completo de regiones y comunas para evitar limites de paginacion de Liquid.
- `sections/shipping-location-selector.liquid`
  Modal, launcher de header/mobile y payload inicial de datos.
- `snippets/shipping-location-bootstrap.liquid`
  Bootstrap global para que la logica exista aunque la seccion visual no se haya renderizado aun.
- `assets/labels-and-badges.js`
  Re-render de badges y condicion especial para `custom.label1`.
- `snippets/freeshipping.liquid`
  Barra de progreso comuna-aware en carrito y drawer.
- `layout/theme.liquid`
  Punto de carga global del bootstrap cuando el toggle esta activo.
- `tools/shipping-comuna/import_metaobjects.py`
  Seeder local para metaobjects y configuracion inicial.

## Modelo de datos

### Metaobject `shipping_region`
- `name`
- `slug`
- `active`
- `default_free_shipping_threshold`
- `sort_order`

### Metaobject `shipping_comuna`
- `name`
- `slug`
- `active`
- `region` referencia a `shipping_region`
- `free_shipping_threshold_override`
- `eta_min_days`
- `eta_max_days`
- `estimated_shipping_cost`

### Metaobject `shipping_settings`
- `enabled`
- `popup_enabled`
- `popup_delay_seconds`
- `default_region`
- `default_comuna`
- `global_free_shipping_threshold`

## Persistencia
- `localStorage`
  - `baumartShippingLocationSelection`
- `sessionStorage`
  - `baumartShippingLocationPopupDismissed`
- `cart.attributes`
  - `shipping_region`
  - `shipping_region_slug`
  - `shipping_comuna`
  - `shipping_comuna_slug`

## Flujo de eventos
1. Liquid entrega payload inicial con defaults, regiones, comunas y templates de mensajeria.
2. `xShippingLocation.init()` parsea payload y lo combina con el catalogo JS.
3. El store resuelve la seleccion guardada o el default.
4. El store sincroniza atributos del carrito con `cart/update.js`.
5. El store emite `baumart:shipping-location-changed`.
6. Los consumidores reaccionan:
   - badges
   - barra de carrito
   - launcher y mensajes de ubicacion

## Resolucion de umbral
El metodo `getResolvedThreshold()` usa:
1. `shipping_comuna.free_shipping_threshold_override`
2. `shipping_region.default_free_shipping_threshold`
3. `shipping_settings.global_free_shipping_threshold`

Si ninguna fuente tiene valor, retorna `null`.

## Resolucion de ubicacion
- Si existe una seleccion valida guardada, se usa esa.
- Si no existe, se usa el default de `shipping_settings`.
- Si una seleccion guardada ya no es valida porque la region o comuna fue desactivada, se elimina y se vuelve al default.

## Kill switch
El toggle de theme `enable_comuna_shipping_logic` es el kill switch principal.

### Efecto del kill switch apagado
- No se debe mostrar el selector de comuna.
- No se debe ejecutar la logica comuna-aware en badges.
- No se debe ejecutar la logica comuna-aware en la barra del carrito.
- El theme vuelve al comportamiento original de EURUS para freeshipping.

## Integraciones clave

### Badge de producto
- Se detecta `custom.label1`.
- Solo si el valor normalizado es `envio gratis` se aplica la regla dinamica.
- El badge se vuelve a renderizar cuando cambia la comuna.

### Cart progress
- Usa el umbral resuelto del store.
- Recalcula cuando cambia comuna o cambia el contenido del carrito.

### Header launcher
- Lee el contexto de ubicacion actual.
- Muestra comuna, region y estado `Por defecto` cuando corresponde.

## Riesgos tecnicos mitigados
- Limite de `metaobjects.values` en Liquid:
  mitigado usando `shipping-location-catalog.js`.
- Carga tardia de Alpine:
  mitigada registrando helpers tanto en carga inmediata como en `alpine:init`.
- HTML inyectado por AJAX en cart drawer:
  mitigado re-inicializando Alpine despues de renderizar secciones.
- Config compleja en atributos `x-data`:
  mitigado moviendo la configuracion a JSON embebido.

## Extension points ya preparados
- `eta_min_days`
- `eta_max_days`
- `estimated_shipping_cost`

La UI actual no los usa todavia, pero el modelo ya permite crecer sin rediseñar los metaobjects.
