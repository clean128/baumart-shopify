if (!window.Eurus.loadedScript.has('shipping-location-selector.js')) {
  window.Eurus.loadedScript.add('shipping-location-selector.js');

  requestAnimationFrame(() => {
    const registerShippingLocation = () => {
      if (!window.Alpine || typeof Alpine.store !== 'function' || window.BaumartShippingRegistered) {
        return Boolean(window.BaumartShippingRegistered);
      }

      window.BaumartShippingRegistered = true;

      Alpine.store('xShippingLocation', {
        storageKey: 'baumartShippingLocationSelection',
        cartSyncDelayMs: 350,
        sectionId: '',
        enabled: false,
        designMode: false,
        popupDelaySeconds: 3,
        defaults: {
          region_name: '',
          region_slug: '',
          comuna_name: '',
          comuna_slug: ''
        },
        translations: {
          default_context: 'Showing delivery conditions for __location__',
          selected_context: 'Delivery conditions for __location__',
          location_with_region: '__comuna__, __region__',
          badge_context_default: 'Ref. __location__',
          badge_context_selected: '__location__'
        },
        regions: [],
        comunas: [],
        globalFreeShippingThreshold: null,
        hasLocations: false,
        explicitSelection: null,
        cartSyncTimer: null,
        initialized: false,
        rawPayload: '{}',
        catalogRefreshAttempts: 0,
        maxCatalogRefreshAttempts: 20,

        init(sectionId) {
          const payloadEl = document.getElementById(`ShippingLocationSelectorData-${sectionId}`);
          if (!payloadEl) return;

          this.sectionId = sectionId;
          this.catalogRefreshAttempts = 0;
          this.rawPayload = payloadEl.textContent || '{}';
          this.parsePayload(this.rawPayload);
          this.hydrateFromCatalog();
          this.scheduleCatalogRefresh();

          if (!this.enabled) {
            this.resetState();
            return;
          }

          this.validateExplicitSelection();
          this.initialized = true;
          this.queueCartSync(this.getSelectedLocation(), this.hasSavedSelection() ? 'saved' : 'default');
        },

        parsePayload(rawPayload) {
          let payload = {};
          const catalog = window.BaumartShippingCatalog || {};

          try {
            payload = JSON.parse(rawPayload);
          } catch (error) {
            payload = {};
          }

          this.enabled = Boolean(payload.enabled);
          this.designMode = Boolean(payload.design_mode);
          this.popupDelaySeconds = Number(payload.popup_delay_seconds) || 3;
          this.defaults = payload.defaults || catalog.defaults || this.defaults;
          this.translations = {
            ...this.translations,
            ...(payload.translations || {})
          };
          this.globalFreeShippingThreshold = this.normalizeThreshold(payload.global_free_shipping_threshold);

          const payloadRegions = Array.isArray(payload.regions) ? payload.regions : [];
          const payloadRegionMap = new Map(
            payloadRegions
              .filter((region) => region && region.slug)
              .map((region) => [region.slug, region])
          );
          const regions = Array.isArray(catalog.regions) && catalog.regions.length > 0 ? catalog.regions : payloadRegions;

          this.regions = regions
            .filter((region) => region && region.slug && region.active !== false)
            .map((region) => ({
              ...region,
              ...payloadRegionMap.get(region.slug),
              default_free_shipping_threshold: this.normalizeThreshold(
                payloadRegionMap.get(region.slug)?.default_free_shipping_threshold ?? region.default_free_shipping_threshold
              )
            }))
            .sort((first, second) => {
              const firstOrder = Number(first.sort_order) || 999;
              const secondOrder = Number(second.sort_order) || 999;

              if (firstOrder !== secondOrder) {
                return firstOrder - secondOrder;
              }

              return String(first.name || '').localeCompare(String(second.name || ''), 'es');
            });

          const activeRegionSlugs = new Set(this.regions.map((region) => region.slug));
          const payloadComunas = Array.isArray(payload.comunas) ? payload.comunas : [];
          const payloadComunaMap = new Map(
            payloadComunas
              .filter((comuna) => comuna && comuna.slug)
              .map((comuna) => [comuna.slug, comuna])
          );
          const comunas = Array.isArray(catalog.comunas) && catalog.comunas.length > 0 ? catalog.comunas : payloadComunas;

          this.comunas = comunas
            .filter((comuna) => {
              const overlay = payloadComunaMap.get(comuna.slug) || {};
              const merged = { ...comuna, ...overlay };
              return comuna
                && merged.slug
                && merged.region_slug
                && merged.active !== false
                && activeRegionSlugs.has(merged.region_slug);
            })
            .map((comuna) => ({
              ...comuna,
              ...payloadComunaMap.get(comuna.slug),
              free_shipping_threshold_override: this.normalizeThreshold(
                payloadComunaMap.get(comuna.slug)?.free_shipping_threshold_override ?? comuna.free_shipping_threshold_override
              )
            }))
            .sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'es'));

          this.hasLocations = this.regions.length > 0 && this.comunas.length > 0;
          this.explicitSelection = this.readExplicitSelection();
        },

        normalizeThreshold(value) {
          if (value === null || value === undefined || value === '') {
            return null;
          }

          const normalizedValue = Number(value);
          return Number.isFinite(normalizedValue) ? normalizedValue : null;
        },

        hasCatalog() {
          return Boolean(
            window.BaumartShippingCatalog
            && Array.isArray(window.BaumartShippingCatalog.regions)
            && Array.isArray(window.BaumartShippingCatalog.comunas)
            && window.BaumartShippingCatalog.regions.length > 0
            && window.BaumartShippingCatalog.comunas.length > 0
          );
        },

        needsCatalogHydration() {
          if (!this.hasCatalog()) {
            return false;
          }

          const defaultLocation = this.buildLocationFromSlugs(
            this.defaults.region_slug,
            this.defaults.comuna_slug
          );

          return !defaultLocation
            || this.comunas.length < window.BaumartShippingCatalog.comunas.length
            || this.regions.length < window.BaumartShippingCatalog.regions.length;
        },

        hydrateFromCatalog() {
          if (!this.needsCatalogHydration()) {
            return;
          }

          this.parsePayload(this.rawPayload);
          this.validateExplicitSelection();
        },

        scheduleCatalogRefresh() {
          if (!this.enabled || this.hasCatalog() || this.catalogRefreshAttempts >= this.maxCatalogRefreshAttempts) {
            if (this.hasCatalog()) {
              this.hydrateFromCatalog();
            }
            return;
          }

          this.catalogRefreshAttempts += 1;

          window.setTimeout(() => {
            this.scheduleCatalogRefresh();
          }, 150);
        },

        resetState() {
          this.clearCartSyncTimer();
          this.initialized = false;
          this.explicitSelection = null;
          this.rawPayload = '{}';
          this.catalogRefreshAttempts = 0;
          localStorage.removeItem(this.storageKey);
        },

        clearCartSyncTimer() {
          if (this.cartSyncTimer) {
            window.clearTimeout(this.cartSyncTimer);
            this.cartSyncTimer = null;
          }
        },

        readExplicitSelection() {
          const rawSelection = localStorage.getItem(this.storageKey);

          if (!rawSelection) {
            return null;
          }

          try {
            return JSON.parse(rawSelection);
          } catch (error) {
            localStorage.removeItem(this.storageKey);
            return null;
          }
        },

        hasSavedSelection() {
          return Boolean(this.explicitSelection);
        },

        getRegionBySlug(regionSlug) {
          if (!regionSlug) return null;

          return this.regions.find((region) => region.slug === regionSlug) || null;
        },

        getComunaBySlug(comunaSlug) {
          if (!comunaSlug) return null;

          return this.comunas.find((comuna) => comuna.slug === comunaSlug) || null;
        },

        getComunasByRegion(regionSlug) {
          if (!regionSlug) {
            return [];
          }

          return this.comunas.filter((comuna) => comuna.region_slug === regionSlug);
        },

        buildLocationFromSlugs(regionSlug, comunaSlug) {
          const region = this.getRegionBySlug(regionSlug);
          const comuna = this.getComunaBySlug(comunaSlug);

          if (!region || !comuna || comuna.region_slug !== region.slug) {
            return null;
          }

          return {
            regionSlug: region.slug,
            regionName: region.name,
            comunaSlug: comuna.slug,
            comunaName: comuna.name
          };
        },

        getDefaultLocation() {
          this.hydrateFromCatalog();
          const location = this.buildLocationFromSlugs(
            this.defaults.region_slug,
            this.defaults.comuna_slug
          );

          return location || null;
        },

        validateExplicitSelection() {
          if (!this.explicitSelection) return;

          const validSelection = this.buildLocationFromSlugs(
            this.explicitSelection.regionSlug,
            this.explicitSelection.comunaSlug
          );

          if (!validSelection) {
            this.explicitSelection = null;
            localStorage.removeItem(this.storageKey);
            return;
          }

          this.explicitSelection = validSelection;
        },

        getSelectedLocation() {
          this.hydrateFromCatalog();
          return this.explicitSelection || this.getDefaultLocation();
        },

        isUsingDefaultFallback() {
          return !this.hasSavedSelection() && Boolean(this.getDefaultLocation());
        },

        formatTemplate(template, replacements = {}) {
          return Object.entries(replacements).reduce((output, [key, value]) => {
            const token = String(key || '');
            const normalizedValue = String(value ?? '');

            return output
              .replaceAll(`__${token}__`, normalizedValue)
              .replaceAll(`__${token.toLowerCase()}__`, normalizedValue)
              .replaceAll(`__${token.toUpperCase()}__`, normalizedValue);
          }, String(template || ''));
        },

        getMessagingContext(location = this.getSelectedLocation()) {
          if (!location) {
            return null;
          }

          const isDefaultFallback = this.isUsingDefaultFallback();
          const fullLocationLabel = this.formatTemplate(this.translations.location_with_region, {
            comuna: location.comunaName,
            region: location.regionName
          });

          return {
            location,
            isDefaultFallback,
            primaryLocationLabel: location.comunaName,
            regionLabel: location.regionName,
            fullLocationLabel,
            contextMessage: this.formatTemplate(
              isDefaultFallback ? this.translations.default_context : this.translations.selected_context,
              { location: location.comunaName }
            ),
            badgeContext: this.formatTemplate(
              isDefaultFallback ? this.translations.badge_context_default : this.translations.badge_context_selected,
              { location: location.comunaName }
            )
          };
        },

        canRender() {
          return this.enabled && this.hasLocations;
        },

        persistExplicitSelection(location) {
          localStorage.setItem(this.storageKey, JSON.stringify(location));
          this.explicitSelection = location;
        },

        confirmSelection(selection, source = 'manual') {
          const location = this.buildLocationFromSlugs(selection.regionSlug, selection.comunaSlug);
          if (!location) {
            return false;
          }

          this.persistExplicitSelection(location);
          this.queueCartSync(location, source);
          return true;
        },

        getResolvedThreshold(location = this.getSelectedLocation()) {
          if (!location) {
            return this.globalFreeShippingThreshold;
          }

          const comuna = this.getComunaBySlug(location.comunaSlug);
          if (comuna && comuna.free_shipping_threshold_override !== null) {
            return comuna.free_shipping_threshold_override;
          }

          const region = this.getRegionBySlug(location.regionSlug);
          if (region && region.default_free_shipping_threshold !== null) {
            return region.default_free_shipping_threshold;
          }

          return this.globalFreeShippingThreshold;
        },

        productQualifies(price, location = this.getSelectedLocation()) {
          const threshold = this.getResolvedThreshold(location);
          if (threshold === null) {
            return false;
          }

          return Number(price || 0) >= threshold;
        },

        getRemaining(cartTotal, location = this.getSelectedLocation()) {
          const threshold = this.getResolvedThreshold(location);
          if (threshold === null) {
            return null;
          }

          return Math.max(threshold - Number(cartTotal || 0), 0);
        },

        buildCartAttributes(location) {
          return {
            shipping_region: location.regionName,
            shipping_region_slug: location.regionSlug,
            shipping_comuna: location.comunaName,
            shipping_comuna_slug: location.comunaSlug
          };
        },

        queueCartSync(location, source) {
          if (!this.enabled || !location) {
            return;
          }

          this.clearCartSyncTimer();

          this.cartSyncTimer = window.setTimeout(() => {
            this.syncCartAttributes(location, source);
          }, this.cartSyncDelayMs);
        },

        async syncCartAttributes(location, source) {
          if (!this.enabled || !location) {
            return;
          }

          const cartPayload = {
            attributes: this.buildCartAttributes(location)
          };

          let cartSynced = false;

          try {
            const cartHelper = window.Alpine && Alpine.store('xCartHelper');
            if (cartHelper && typeof cartHelper.waitForCartUpdate === 'function') {
              await cartHelper.waitForCartUpdate();
            }

            const response = await fetch(`${Shopify.routes.root}cart/update.js`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              body: JSON.stringify(cartPayload)
            });

            cartSynced = response.ok;
          } catch (error) {
            cartSynced = false;
          }

          this.dispatchLocationChanged(source, cartSynced);
        },

        dispatchLocationChanged(source = 'system', cartSynced = false) {
          const location = this.getSelectedLocation();
          if (!location) {
            return;
          }

          const detail = {
            location,
            resolvedThreshold: this.getResolvedThreshold(location),
            hasSavedSelection: this.hasSavedSelection(),
            source,
            cartSynced
          };

          document.dispatchEvent(new CustomEvent('baumart:shipping-location-changed', { detail }));
        },

        ensureInitialized() {
          if (this.initialized) {
            return true;
          }

          const payloadEl = document.querySelector('[id^="ShippingLocationSelectorData-"]');
          if (!payloadEl) {
            return false;
          }

          const sectionId = payloadEl.id.replace('ShippingLocationSelectorData-', '');
          this.init(sectionId);
          return this.initialized;
        }
      });

      Alpine.store('xShippingLocationSelector', {
        sessionKey: 'baumartShippingLocationPopupDismissed',
        sectionId: '',
        show: false,
        form: {
          regionSlug: '',
          comunaSlug: ''
        },
        autoOpenTimer: null,

        init(sectionId) {
          this.sectionId = sectionId;
          Alpine.store('xShippingLocation').init(sectionId);

          if (!this.canRender()) {
            this.resetState();
            return;
          }

          this.prepareForm();
          this.queueAutoOpen();
        },

        resetState() {
          this.clearTimers();
          this.show = false;
          this.form = {
            regionSlug: '',
            comunaSlug: ''
          };
          sessionStorage.removeItem(this.sessionKey);
        },

        clearTimers() {
          if (this.autoOpenTimer) {
            window.clearTimeout(this.autoOpenTimer);
            this.autoOpenTimer = null;
          }
        },

        prepareForm() {
          const locationStore = Alpine.store('xShippingLocation');
          if (locationStore.hasSavedSelection()) {
            this.form.regionSlug = locationStore.explicitSelection.regionSlug;
            this.form.comunaSlug = locationStore.explicitSelection.comunaSlug;
            return;
          }

          this.form.regionSlug = '';
          this.form.comunaSlug = '';
        },

        queueAutoOpen() {
          this.clearTimers();

          if (!this.canAutoOpen()) return;

          this.autoOpenTimer = window.setTimeout(() => {
            this.open();
          }, Alpine.store('xShippingLocation').popupDelaySeconds * 1000);
        },

        canAutoOpen() {
          const locationStore = Alpine.store('xShippingLocation');
          return locationStore.enabled
            && locationStore.hasLocations
            && !locationStore.designMode
            && !locationStore.hasSavedSelection()
            && !sessionStorage.getItem(this.sessionKey);
        },

        canRender() {
          return Alpine.store('xShippingLocation').canRender();
        },

        open() {
          if (!this.canRender()) return;

          this.clearTimers();
          this.prepareForm();
          this.show = true;
        },

        close() {
          this.show = false;
        },

        dismiss() {
          if (!this.hasExplicitSelection()) {
            sessionStorage.setItem(this.sessionKey, 'true');
          }

          this.close();
        },

        onRegionChange(regionSlug) {
          this.form.regionSlug = regionSlug;
          const availableComunas = this.getAvailableComunas();

          if (!availableComunas.some((comuna) => comuna.slug === this.form.comunaSlug)) {
            this.form.comunaSlug = '';
          }
        },

        getAvailableComunas() {
          return Alpine.store('xShippingLocation').getComunasByRegion(this.form.regionSlug);
        },

        canSave() {
          return Boolean(
            Alpine.store('xShippingLocation').buildLocationFromSlugs(
              this.form.regionSlug,
              this.form.comunaSlug
            )
          );
        },

        save() {
          if (!this.canSave()) return;

          Alpine.store('xShippingLocation').confirmSelection(
            {
              regionSlug: this.form.regionSlug,
              comunaSlug: this.form.comunaSlug
            },
            'manual'
          );

          sessionStorage.removeItem(this.sessionKey);
          this.close();
        },

        hasExplicitSelection() {
          return Alpine.store('xShippingLocation').hasSavedSelection();
        },

        getLauncherLabel() {
          return this.getLauncherPrimaryText();
        },

        getLauncherPrimaryText() {
          const context = Alpine.store('xShippingLocation').getMessagingContext();
          return context ? context.primaryLocationLabel : '';
        },

        getLauncherSecondaryText() {
          const context = Alpine.store('xShippingLocation').getMessagingContext();
          return context ? context.regionLabel : '';
        },

        usesDefaultFallback() {
          return Alpine.store('xShippingLocation').isUsingDefaultFallback();
        },

        getStatusMessage() {
          const context = Alpine.store('xShippingLocation').getMessagingContext();
          return context ? context.contextMessage : '';
        }
      });

      window.BaumartShipping = {
        getSelectedLocation() {
          Alpine.store('xShippingLocation').ensureInitialized();
          return Alpine.store('xShippingLocation').getSelectedLocation();
        },
        getResolvedThreshold() {
          Alpine.store('xShippingLocation').ensureInitialized();
          return Alpine.store('xShippingLocation').getResolvedThreshold();
        },
        productQualifies(price) {
          Alpine.store('xShippingLocation').ensureInitialized();
          return Alpine.store('xShippingLocation').productQualifies(price);
        },
        getRemaining(cartTotal) {
          Alpine.store('xShippingLocation').ensureInitialized();
          return Alpine.store('xShippingLocation').getRemaining(cartTotal);
        },
        getMessagingContext() {
          Alpine.store('xShippingLocation').ensureInitialized();
          return Alpine.store('xShippingLocation').getMessagingContext();
        }
      };

      window.BaumartComunaFreeShipping = window.BaumartComunaFreeShipping || {};
      if (!window.BaumartComunaFreeShipping.initialized) {
        window.BaumartComunaFreeShipping.initialized = true;
        window.BaumartComunaFreeShipping.broadcast = function(syncCartTotal) {
          document.querySelectorAll('[data-comuna-freeshipping]').forEach((element) => {
            element.dispatchEvent(new CustomEvent('baumart:freeshipping:update', {
              detail: { syncCartTotal }
            }));
          });
        };

        document.addEventListener('baumart:shipping-location-changed', () => {
          window.BaumartComunaFreeShipping.broadcast(false);
        });

        document.addEventListener('eurus:cart:items-changed', () => {
          window.BaumartComunaFreeShipping.broadcast(true);
        });
      }

      window.xComunaFreeShippingBar = window.xComunaFreeShippingBar || ((config) => ({
        cartTotal: Number(config.cartTotal) || 0,
        moneyFormat: config.moneyFormat,
        freeShippingEnabled: Boolean(config.freeShippingEnabled),
        freegiftThreshold: config.freegiftThreshold === null ? null : Number(config.freegiftThreshold),
        otherOfferName: config.otherOfferName || '',
        translations: config.translations || {},
        freeShippingThreshold: null,
        amountToFreeShipping: null,
        amountToFreegift: null,
        showFreeShipping: false,
        showFreegift: false,
        canRender: false,
        showPendingState: false,
        showCombinedSuccess: false,
        showFreeShippingSuccess: false,
        showFreegiftSuccess: false,
        locationContextMessage: '',
        progressPercent: 0,
        isRtl: document.documentElement.getAttribute('dir') === 'rtl',
        helperRetryCount: 0,
        maxHelperRetryCount: 12,

        init() {
          this.refresh();
          this.$el.addEventListener('baumart:freeshipping:update', async (event) => {
            if (event.detail && event.detail.syncCartTotal) {
              await this.refreshCartTotal();
            }

            this.refresh();
          });
        },

        normalizeThreshold(value) {
          if (value === null || value === undefined || value === '' || value === false) {
            return null;
          }

          const normalizedValue = Number(value);
          return Number.isFinite(normalizedValue) ? normalizedValue : null;
        },

        async refreshCartTotal() {
          try {
            const response = await fetch(`${Shopify.routes.root}cart.js`, {
              headers: { Accept: 'application/json' }
            });

            if (!response.ok) {
              return;
            }

            const cart = await response.json();
            this.cartTotal = Number(cart.total_price || 0) / 100;
          } catch (error) {
          }
        },

        resolveFreeShippingThreshold() {
          if (window.BaumartShipping && typeof window.BaumartShipping.getResolvedThreshold === 'function') {
            return this.normalizeThreshold(window.BaumartShipping.getResolvedThreshold());
          }

          if (this.helperRetryCount < this.maxHelperRetryCount) {
            this.helperRetryCount += 1;
            window.setTimeout(() => this.refresh(), 150);
          }

          return null;
        },

        refresh() {
          this.freeShippingThreshold = this.resolveFreeShippingThreshold();
          this.showFreeShipping = this.freeShippingEnabled && this.freeShippingThreshold !== null;
          this.showFreegift = this.freegiftThreshold !== null;
          this.canRender = this.showFreeShipping || this.showFreegift;
          this.locationContextMessage = this.getLocationContextMessage();

          if (!this.canRender) {
            this.amountToFreeShipping = null;
            this.amountToFreegift = null;
            this.progressPercent = 0;
            this.showPendingState = false;
            this.showCombinedSuccess = false;
            this.showFreeShippingSuccess = false;
            this.showFreegiftSuccess = false;
            return;
          }

          this.amountToFreeShipping = this.showFreeShipping ? this.freeShippingThreshold - this.cartTotal : null;
          this.amountToFreegift = this.showFreegift ? this.freegiftThreshold - this.cartTotal : null;

          const freeShippingPending = this.showFreeShipping && this.amountToFreeShipping > 0;
          const freegiftPending = this.showFreegift && this.amountToFreegift > 0;

          this.showPendingState = freeShippingPending || freegiftPending;
          this.showCombinedSuccess = this.showFreeShipping && this.showFreegift && !freeShippingPending && !freegiftPending;
          this.showFreeShippingSuccess = this.showFreeShipping && !freeShippingPending && !this.showCombinedSuccess;
          this.showFreegiftSuccess = this.showFreegift && !freegiftPending && !this.showCombinedSuccess;
          this.progressPercent = this.getProgressPercent();
        },

        getLocationContextMessage() {
          if (!window.BaumartShipping || typeof window.BaumartShipping.getMessagingContext !== 'function') {
            return '';
          }

          return window.BaumartShipping.getMessagingContext()?.contextMessage || '';
        },

        getBaseThreshold() {
          return Math.max(
            this.showFreeShipping ? this.freeShippingThreshold : 0,
            this.showFreegift ? this.freegiftThreshold : 0
          );
        },

        getProgressPercent() {
          const baseThreshold = this.getBaseThreshold();
          if (!baseThreshold) {
            return 0;
          }

          return Math.max(Math.min((this.cartTotal / baseThreshold) * 100, 100), 0);
        },

        formatMoneyAmount(amount) {
          if (!window.Alpine || !Alpine.store('xHelper')) {
            return amount;
          }

          return Alpine.store('xHelper').formatMoney(Math.round(Math.max(amount, 0) * 100), this.moneyFormat);
        },

        getFreeShippingMessage() {
          if (!this.showFreeShipping) {
            return '';
          }

          if (this.amountToFreeShipping > 0) {
            return this.translations.enableAmountFreeShipping.replace('__amount__', this.formatMoneyAmount(this.amountToFreeShipping));
          }

          return this.translations.freeShipping;
        },

        getFreegiftMessage() {
          if (!this.showFreegift) {
            return '';
          }

          if (this.amountToFreegift > 0) {
            return this.translations.enableAmountFreegift.replace('__amount__', this.formatMoneyAmount(this.amountToFreegift));
          }

          return this.translations.freegift;
        },

        getMarkerPosition(threshold) {
          const baseThreshold = this.getBaseThreshold();
          if (!baseThreshold || threshold === null) {
            return 100;
          }

          return Math.min((threshold / baseThreshold) * 100, 100);
        },

        getMarkerStyle(threshold) {
          const position = this.getMarkerPosition(threshold);
          return `${this.isRtl ? 'right' : 'left'}: ${position}%;`;
        },

        getWrapperPaddingClass() {
          return this.showFreeShipping && this.showFreegift
            ? 'pt-3 pb-7 pl-4 pr-8 rtl:pr-4 rtl:pl-8'
            : 'pt-3 pb-3 pl-4 pr-4';
        }
      }));

      window.xComunaFreeShippingBarFromConfig = window.xComunaFreeShippingBarFromConfig || ((configId) => {
        let config = {};

        if (configId) {
          const configElement = document.getElementById(configId);
          if (configElement?.textContent) {
            try {
              config = JSON.parse(configElement.textContent);
            } catch (error) {
              config = {};
            }
          }
        }

        return window.xComunaFreeShippingBar(config);
      });
      return true;
    };

    if (!registerShippingLocation()) {
      document.addEventListener('alpine:init', registerShippingLocation, { once: true });
    }
  });
}
