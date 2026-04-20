# Runbook Admin

Guia operativa pensada para usuarios no tecnicos del equipo Baumart.

## 1. Activar o desactivar la funcionalidad

### Activar
1. Ir a `Online Store > Themes`.
2. Abrir `Customize` del theme que se esta usando.
3. Ir a `Theme settings > Shipping and delivery`.
4. Activar `Enable comuna shipping logic`.

### Desactivar
1. Ir al mismo setting.
2. Apagar `Enable comuna shipping logic`.

Resultado:
- el sitio vuelve a la logica original de freeshipping del theme.
- los metaobjects no se borran.

## 2. Cambiar el default del sitio
1. Ir a `Content > Metaobjects > Shipping Settings`.
2. Abrir la unica entrada.
3. Cambiar:
   - `default_region`
   - `default_comuna`
4. Guardar.

Uso recomendado:
- mantener un default de alta cobertura comercial.
- hoy la referencia esperada es `Santiago / Region Metropolitana de Santiago`.

## 3. Cambiar umbral global
1. Ir a `Content > Metaobjects > Shipping Settings`.
2. Editar `global_free_shipping_threshold`.
3. Guardar.

Cuando usarlo:
- como piso de seguridad para comunas o regiones sin configuracion especifica.

## 4. Cambiar umbral por region
1. Ir a `Content > Metaobjects > Shipping Region`.
2. Buscar la region.
3. Editar `default_free_shipping_threshold`.
4. Guardar.

Cuando usarlo:
- cuando la mayoria de las comunas de esa region comparten la misma regla.

## 5. Agregar override por comuna
1. Ir a `Content > Metaobjects > Shipping Comuna`.
2. Buscar la comuna.
3. Editar `free_shipping_threshold_override`.
4. Guardar.

Cuando usarlo:
- cuando una comuna necesita una excepcion respecto de la region.

## 6. Activar o desactivar regiones y comunas

### Region
1. Abrir la region en `Shipping Region`.
2. Cambiar `active` a `true` o `false`.
3. Guardar.

Efecto:
- una region inactiva desaparece del selector.
- sus comunas dejan de estar disponibles funcionalmente.

### Comuna
1. Abrir la comuna en `Shipping Comuna`.
2. Cambiar `active` a `true` o `false`.
3. Guardar.

Efecto:
- la comuna desaparece del selector.

## 7. Validacion minima despues de un cambio
1. Abrir el storefront.
2. Cambiar a la comuna afectada.
3. Verificar:
   - header
   - badge de envio gratis en un producto de prueba
   - barra del carrito

## 8. Recomendaciones operativas
- Cambiar primero el umbral global si el ajuste afecta a muchas zonas.
- Usar overrides por comuna solo para excepciones reales.
- Evitar desactivar regiones o comunas sin validar el impacto en el selector.
- Guardar una nota interna con fecha y motivo cada vez que cambian umbrales de forma masiva.
