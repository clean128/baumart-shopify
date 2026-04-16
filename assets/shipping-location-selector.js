if (!window.Eurus.loadedScript.has('shipping-location-selector.js')) {
  window.Eurus.loadedScript.add('shipping-location-selector.js');

  requestAnimationFrame(() => {
    document.addEventListener('alpine:init', () => {
      Alpine.store('xShippingLocationSelector', {
        storageKey: 'baumartShippingLocationSelection',
        sessionKey: 'baumartShippingLocationPopupDismissed',
        sectionId: '',
        enabled: false,
        designMode: false,
        show: false,
        popupDelaySeconds: 3,
        defaults: {
          region_name: '',
          region_slug: '',
          comuna_name: '',
          comuna_slug: ''
        },
        regions: [],
        comunas: [],
        hasLocations: false,
        selected: null,
        form: {
          regionSlug: '',
          comunaSlug: ''
        },
        autoOpenTimer: null,

        init(sectionId) {
          const payloadEl = document.getElementById(`ShippingLocationSelectorData-${sectionId}`);
          if (!payloadEl) return;

          this.sectionId = sectionId;
          this.parsePayload(payloadEl.textContent || '{}');

          if (!this.enabled) {
            this.resetState();
            return;
          }

          this.validateSelection();
          this.prepareForm();
          this.queueAutoOpen();
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

          const regions = Array.isArray(payload.regions) ? payload.regions : [];
          this.regions = regions
            .filter((region) => region && region.slug && region.active !== false)
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
            .sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'es'));

          this.hasLocations = this.regions.length > 0 && this.comunas.length > 0;
          this.selected = this.readSelection();
        },

        resetState() {
          this.clearTimers();
          this.show = false;
          this.selected = null;
          this.form = {
            regionSlug: '',
            comunaSlug: ''
          };
          localStorage.removeItem(this.storageKey);
          sessionStorage.removeItem(this.sessionKey);
        },

        clearTimers() {
          if (this.autoOpenTimer) {
            window.clearTimeout(this.autoOpenTimer);
            this.autoOpenTimer = null;
          }
        },

        readSelection() {
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

        validateSelection() {
          if (!this.selected) return;

          const region = this.getRegionBySlug(this.selected.regionSlug);
          const comuna = this.getComunaBySlug(this.selected.comunaSlug);

          if (!region || !comuna || comuna.region_slug !== region.slug) {
            this.selected = null;
            localStorage.removeItem(this.storageKey);
          }
        },

        prepareForm() {
          if (this.selected) {
            this.form.regionSlug = this.selected.regionSlug;
            this.form.comunaSlug = this.selected.comunaSlug;
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
          }, this.popupDelaySeconds * 1000);
        },

        canAutoOpen() {
          return this.enabled
            && this.hasLocations
            && !this.designMode
            && !this.selected
            && !sessionStorage.getItem(this.sessionKey);
        },

        canRender() {
          return this.enabled && this.hasLocations;
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
          if (!this.selected) {
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
          if (!this.form.regionSlug) {
            return [];
          }

          return this.comunas.filter((comuna) => comuna.region_slug === this.form.regionSlug);
        },

        getRegionBySlug(regionSlug) {
          if (!regionSlug) return null;

          return this.regions.find((region) => region.slug === regionSlug) || null;
        },

        getComunaBySlug(comunaSlug) {
          if (!comunaSlug) return null;

          return this.comunas.find((comuna) => comuna.slug === comunaSlug) || null;
        },

        canSave() {
          if (!this.form.regionSlug || !this.form.comunaSlug) {
            return false;
          }

          const region = this.getRegionBySlug(this.form.regionSlug);
          const comuna = this.getComunaBySlug(this.form.comunaSlug);

          return Boolean(region && comuna && comuna.region_slug === region.slug);
        },

        save() {
          if (!this.canSave()) return;

          const region = this.getRegionBySlug(this.form.regionSlug);
          const comuna = this.getComunaBySlug(this.form.comunaSlug);

          this.selected = {
            regionSlug: region.slug,
            regionName: region.name,
            comunaSlug: comuna.slug,
            comunaName: comuna.name
          };

          localStorage.setItem(this.storageKey, JSON.stringify(this.selected));
          sessionStorage.removeItem(this.sessionKey);
          this.close();
        },

        getLauncherLabel() {
          if (!this.selected) {
            return '';
          }

          return `${this.selected.comunaName}, ${this.selected.regionName}`;
        }
      });
    });
  });
}
