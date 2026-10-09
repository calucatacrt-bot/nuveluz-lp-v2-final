(() => {
  const CONTENT_NAME = 'El Código de la Primera Impresión';
  const CAPI_ENDPOINT = '/api/capi';
  const TEST_EVENT_CODE = new URLSearchParams(window.location.search).get('test_event_code');
  const PRODUCTION_HOSTS = new Set(['www.nuveluz.com', 'nuveluz.com']);
  const IS_PRODUCTION_HOST = PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase());
  const IS_PRODUCTION_TEST_BLOCKED = IS_PRODUCTION_HOST && Boolean(TEST_EVENT_CODE);

  let parameterBuilderReady = null;

  function getParameterBuilderParams() {
    if (!window.clientParamBuilder) return Promise.resolve({});
    if (!parameterBuilderReady) {
      parameterBuilderReady = window.clientParamBuilder.processAndCollectAllParams();
    }
    return parameterBuilderReady;
  }

  function makeEventId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return prefix + '_' + window.crypto.randomUUID();
    }
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  async function sendServerEvent(eventName, eventId, customData) {
    if (IS_PRODUCTION_TEST_BLOCKED) {
      console.warn('[Nuveluz] CAPI bloqueada: test_event_code en dominio de producción.');
      return { ok: false, blocked: true };
    }

    try {
      const response = await fetch(CAPI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({
          event_name: eventName,
          event_id: eventId,
          custom_data: customData || {},
          ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {})
        })
      });

      if (!response.ok) {
        console.warn('Nuveluz CAPI:', response.status);
        return { ok: false, status: response.status };
      }
      return { ok: true, status: response.status };
    } catch (error) {
      console.warn('Nuveluz CAPI request failed:', error);
      return { ok: false, error: 'request_failed' };
    }
  }

  async function trackEvent(eventName, customData, prefix) {
    if (IS_PRODUCTION_TEST_BLOCKED) {
      console.warn('[Nuveluz] Pixel bloqueado: test_event_code en dominio de producción.');
      return;
    }

    const eventId = makeEventId(prefix);
    await getParameterBuilderParams();

    if (window.fbq) {
      window.fbq('track', eventName, customData || {}, { eventID: eventId });
    }

    await sendServerEvent(eventName, eventId, customData);
  }

  function revealVslCta() {
    const cta = document.getElementById('vsl-cta');
    if (cta) cta.classList.add('is-visible');
  }

  // ViewContent: un solo ID por sesión y solo en el primer Play de la VSL.
  const VC_SESSION_ID_KEY = 'nuveluz_vc_id';
  const VC_SESSION_FIRED_KEY = 'nuveluz_vc_fired';

  function getOrCreateVCSessionId() {
    const existingId = sessionStorage.getItem(VC_SESSION_ID_KEY);
    if (existingId) return existingId;

    const id = 'vc_' + (
      window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now() + '_' + Math.random().toString(36).slice(2)
    );

    sessionStorage.setItem(VC_SESSION_ID_KEY, id);
    return id;
  }

  function trackVslViewContentOnce() {
    if (IS_PRODUCTION_TEST_BLOCKED) {
      console.warn('[Nuveluz] ViewContent bloqueado: test_event_code en dominio de producción.');
      return;
    }

    if (sessionStorage.getItem(VC_SESSION_FIRED_KEY) === '1') return;

    const eventId = getOrCreateVCSessionId();
    sessionStorage.setItem(VC_SESSION_FIRED_KEY, '1');

    const eventData = {
      content_name: CONTENT_NAME,
      content_type: 'product',
      content_source: 'vsl_play'
    };

    if (window.fbq) {
      window.fbq('track', 'ViewContent', eventData, { eventID: eventId });
    }

    sendServerEvent('ViewContent', eventId, eventData).catch(() => {});
    console.log('[CAPI] ViewContent dedup once', eventId);
  }

  if (IS_PRODUCTION_TEST_BLOCKED) {
    console.error('[Nuveluz] Teste bloqueado em produção. Nenhum evento deste script será enviado.');
  }

  // Wistia: CTA no final do vídeo e ViewContent no primeiro Play real.
  window._wq = window._wq || [];
  window._wq.push({
    id: 'jm4ut5o1o7',
    onReady: function(video) {
      video.volume(1);

      const oncePlayHandler = function() {
        video.unbind('play', oncePlayHandler);
        trackVslViewContentOnce();
      };
      video.bind('play', oncePlayHandler);

      const revealWindow = 12;
      video.bind('secondchange', function(second) {
        const duration = video.duration();
        if (duration > 0 && second >= Math.floor(duration) - revealWindow) {
          revealVslCta();
        }
      });

      video.bind('end', function() {
        revealVslCta();
      });
    }
  });

  function initATCNuveluz() {
    const ctasReais = document.querySelectorAll(
      '[data-cta="vsl-final"], [data-cta="offer-price"]'
    );

    ctasReais.forEach((el) => {
      if (el.dataset.atcInit === 'true') return;
      el.dataset.atcInit = 'true';

      el.addEventListener('click', () => {
        const placement = el.dataset.cta || 'unknown';
        const eventData = {
          content_name: CONTENT_NAME,
          content_type: 'product',
          placement
        };
        trackEvent('AddToCart', eventData, 'atc').catch(() => {});
      });
    });
  }

  initATCNuveluz();
})();
