if (!window.Eurus.loadedScript.has('shipping-location-selector.js')) {
  window.Eurus.loadedScript.add('shipping-location-selector.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
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
        regions: [],
        comunas: [],
        globalFreeShippingThreshold: null,
        hasLocations: false,
        explicitSelection: null,
        cartSyncTimer: null,

        init(sectionId) {
          const payloadEl = document.getElementById(`ShippingLocationSelectorData-${sectionId}`);
          if (!payloadEl) return;

          this.sectionId = sectionId;
          this.parsePayload(payloadEl.textContent || '{}');

          if (!this.enabled) {
            this.resetState();
            return;
          }

          this.validateExplicitSelection();
          this.queueCartSync(this.getSelectedLocation(), this.hasSavedSelection() ? 'saved' : 'default');
        },

        parsePayload(rawPayload) {
          let payload = {};

          try {
            payload = JSON.parse(rawPayload);
          } catch (error) {
            payload = {};
          }

          this.enabled = Boolean(payload.enabled);
          this.designMode = Boolean(payload.design_mode);
          this.popupDelaySeconds = Number(payload.popup_delay_seconds) || 3;
          this.defaults = payload.defaults || this.defaults;
          this.globalFreeShippingThreshold = this.normalizeThreshold(payload.global_free_shipping_threshold);

          const regions = Array.isArray(payload.regions) ? payload.regions : [];
          this.regions = regions
            .filter((region) => region && region.slug && region.active !== false)
            .map((region) => ({
              ...region,
              default_free_shipping_threshold: this.normalizeThreshold(region.default_free_shipping_threshold)
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
          const comunas = Array.isArray(payload.comunas) ? payload.comunas : [];

          this.comunas = comunas
            .filter((comuna) => {
              return comuna
                && comuna.slug
                && comuna.region_slug
                && comuna.active !== false
                && activeRegionSlugs.has(comuna.region_slug);
            })
            .map((comuna) => ({
              ...comuna,
              free_shipping_threshold_override: this.normalizeThreshold(comuna.free_shipping_threshold_override)
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

        resetState() {
          this.clearCartSyncTimer();
          this.explicitSelection = null;
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
          return this.explicitSelection || this.getDefaultLocation();
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
          const location = Alpine.store('xShippingLocation').getSelectedLocation();
          if (!location) {
            return '';
          }

          return `${location.comunaName}, ${location.regionName}`;
        }
      });

      window.BaumartShipping = {
        getSelectedLocation() {
          return Alpine.store('xShippingLocation').getSelectedLocation();
        },
        getResolvedThreshold() {
          return Alpine.store('xShippingLocation').getResolvedThreshold();
        },
        productQualifies(price) {
          return Alpine.store('xShippingLocation').productQualifies(price);
        },
        getRemaining(cartTotal) {
          return Alpine.store('xShippingLocation').getRemaining(cartTotal);
        }
      };
    });
  });
}
