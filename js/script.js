
document.querySelectorAll('[data-cta]').forEach(el=>el.addEventListener('click',()=>{if(window.fbq)fbq('track','InitiateCheckout',{content_name:'El Código de la Primera Impresión',placement:el.dataset.cta})}));
