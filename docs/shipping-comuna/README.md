# Documentacion Shipping Comuna

Este paquete documenta la solucion de envio gratis por comuna implementada en el theme EURUS de Baumart.

## Documentos incluidos
- [01-documentacion-funcional.md](https://github.com/clean128/baumart-shopify/blob/main/docs/shipping-comuna/01-documentacion-funcional.md)
- [02-documentacion-tecnica.md](https://github.com/clean128/baumart-shopify/blob/main/docs/shipping-comuna/02-documentacion-tecnica.md)
- [03-qa-checklist.md](https://github.com/clean128/baumart-shopify/blob/main/docs/shipping-comuna/03-qa-checklist.md)
- [04-runbook-admin.md](https://github.com/clean128/baumart-shopify/blob/main/docs/shipping-comuna/04-runbook-admin.md)
- [05-importacion-y-rollback.md](https://github.com/clean128/baumart-shopify/blob/main/docs/shipping-comuna/05-importacion-y-rollback.md)

## Resumen
- El checkout no fue modificado. Las tarifas y couriers siguen definidos por Shopify y las apps de despacho.
- La logica de comuna vive en storefront y usa metaobjects nativos de Shopify.
- Existe un kill switch en el theme para desactivar la funcionalidad sin desmontar la configuracion de datos.

## Orden recomendado de lectura
1. Funcional
2. Tecnica
3. Runbook admin
4. QA checklist
5. Importacion y rollback
