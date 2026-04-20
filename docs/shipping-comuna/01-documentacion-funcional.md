# Documentacion Funcional

## Objetivo
Implementar una capa de ubicacion por region y comuna para que la promesa de "envio gratis" deje de depender de un umbral nacional fijo y pase a resolverse con reglas por comuna, con fallback por region y global.

## Alcance funcional
- Selector persistente de region y comuna en header y navegacion mobile.
- Popup de ubicacion al entrar por primera vez cuando el usuario aun no guarda una comuna.
- Badge "Envio gratis" en PDP y PLP condicionado por el umbral de la comuna activa.
- Barra de progreso de envio gratis en carrito y drawer condicionada por la comuna activa.
- Mensajeria visible que indica la ubicacion usada y si la referencia es por defecto.
- Actualizacion en vivo al cambiar comuna, sin recarga completa de pagina.

## Fuera de alcance
- Calculo de tarifas en checkout.
- ETA real por courier.
- Costo estimado de envio en frontend.
- Sincronizacion con geolocalizacion automatica por IP.

## Actores
- Cliente final del ecommerce.
- Equipo interno de Baumart que mantiene umbrales.
- Equipo tecnico que hace despliegues o rollback.

## Regla principal
La resolucion del umbral sigue este orden:
1. Override de la comuna
2. Umbral por region
3. Umbral global

## Comportamiento esperado

### 1. Usuario sin comuna guardada
- El sistema usa `Santiago / Region Metropolitana de Santiago` como referencia por defecto.
- El popup se muestra despues del delay configurado.
- El header muestra comuna y region activas y marca el estado como `Por defecto`.
- La mensajeria deja claro que la referencia actual puede cambiarse.

### 2. Usuario con comuna guardada
- La seleccion se guarda en `localStorage`.
- La misma seleccion se copia a atributos del carrito.
- El popup no vuelve a abrirse automaticamente.
- El header muestra la comuna y region seleccionadas.

### 3. PDP y PLP
- Si el producto tiene `custom.label1 = "Envio gratis"`, el badge solo se muestra cuando el precio cumple el umbral resuelto.
- El badge muestra contexto de ubicacion:
  - `Ref. Santiago` cuando el sistema usa fallback por defecto.
  - nombre de la comuna cuando hay una seleccion explicita.

### 4. Carrito y drawer
- La barra usa el umbral resuelto para la comuna activa.
- La barra muestra una linea de contexto de ubicacion.
- Al cambiar comuna, el mensaje y la barra se actualizan sin reload completo.

### 5. Comunas o regiones desactivadas
- No se muestran en el selector.
- Si el usuario tenia guardada una opcion ya desactivada, el sistema la invalida y vuelve al fallback valido.

## Casos de fallback
- Sin seleccion del usuario: usar default configurado en `shipping_settings`.
- Comuna sin override: usar umbral de region.
- Region sin umbral: usar umbral global.
- Sin umbral global: el beneficio no se calcula y el badge/barra no se muestran.

## Escenario de uso recomendado
1. El usuario entra al sitio.
2. Si aun no definio comuna, el sistema parte con Santiago como referencia.
3. El usuario ve badge y mensajes ya contextualizados.
4. Cuando cambia comuna, el storefront recalcula:
   - badges
   - mensajes de ubicacion
   - barra de progreso del carrito

## Criterios de aceptacion
- El usuario siempre puede saber que comuna se esta usando.
- El estado por defecto esta explicitamente marcado.
- El badge de envio gratis nunca debe mostrarse si el producto no cumple el umbral de la comuna activa.
- El carrito nunca debe seguir usando el umbral nacional fijo cuando la funcionalidad esta activa.
