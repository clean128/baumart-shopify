# QA Checklist

## Datos base
- [ ] Existen `16` regiones activas cuando corresponde.
- [ ] Existen `346` comunas activas cuando corresponde.
- [ ] Existe un `shipping_settings`.
- [ ] El default configurado apunta a una region y comuna validas.
- [ ] Hay al menos un umbral configurado para probar.

## Selector
- [ ] El popup abre despues del delay cuando no existe seleccion guardada.
- [ ] El select de comuna permanece deshabilitado hasta elegir region.
- [ ] El launcher existe en header desktop.
- [ ] El launcher existe en mobile nav.
- [ ] Al guardar una comuna, el popup cierra.
- [ ] La seleccion persiste tras refrescar pagina.

## Fallback
- [ ] Sin seleccion guardada, el sistema usa el default configurado.
- [ ] El header marca el estado `Por defecto`.
- [ ] La mensajeria de fallback muestra la comuna por defecto.
- [ ] Si una comuna no tiene override, se usa el umbral de region.
- [ ] Si la region no tiene umbral, se usa el global.

## Badges PDP y PLP
- [ ] Un producto con `custom.label1 = "Envio gratis"` muestra badge si cumple el umbral.
- [ ] El mismo producto oculta badge si no cumple el umbral.
- [ ] El badge muestra contexto de ubicacion.
- [ ] El badge se actualiza al cambiar comuna sin recargar la pagina.

## Carrito y drawer
- [ ] La barra aparece cuando existe umbral resuelto.
- [ ] La barra usa el umbral de la comuna activa.
- [ ] La barra muestra contexto de ubicacion.
- [ ] Cambiar la comuna actualiza barra y mensaje sin reload completo.
- [ ] Cambiar cantidades del carrito recalcula el progreso.

## Estados desactivados
- [ ] Una comuna inactiva no aparece en el selector.
- [ ] Una region inactiva no aparece en el selector.
- [ ] Si una seleccion guardada queda invalida, el sistema vuelve al default.

## Seguridad operativa
- [ ] Con el kill switch apagado, el comportamiento vuelve al freeshipping original de EURUS.
- [ ] El checkout sigue intacto.
- [ ] Las apps de courier no se ven afectadas en storefront.

## Consola rapida
Comandos utiles durante QA:

```js
window.BaumartShipping.getSelectedLocation()
window.BaumartShipping.getResolvedThreshold()
window.BaumartShipping.getMessagingContext()
window.BaumartShipping.getRemaining(50000)
```
