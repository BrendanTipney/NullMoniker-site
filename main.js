// NullMoniker : shared site scripts.
// Nav, overlay, media loading, and all the motion ("juice").
// Everything that moves checks prefers-reduced-motion first.
(() => {
  const doc = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer  = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  doc.classList.add('js');
  if (reduceMotion) doc.classList.add('reduced-motion');
  if (finePointer)  doc.classList.add('fine-pointer');

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ── NAV : burger, hide on scroll down, solid after hero ── */
  const nav    = $('nav');
  const burger = $('#navBurger');
  const links  = $('#navLinks');
  if (burger && links) {
    burger.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      links.classList.remove('open');
      burger.classList.remove('is-open');
    }));
  }

  /* ── SCROLL PROGRESS + NAV STATE ── */
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  document.body.appendChild(progress);

  let lastY = window.scrollY;
  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    progress.style.transform = 'scaleX(' + (y / max).toFixed(4) + ')';
    if (nav) {
      nav.classList.toggle('is-solid', y > 40);
      const menuOpen = links && links.classList.contains('open');
      if (!menuOpen && y > 300 && y > lastY + 4) nav.classList.add('is-hidden');
      else if (y < lastY - 4 || y < 300) nav.classList.remove('is-hidden');
    }
    lastY = y;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ── TEXT SCRAMBLE ── */
  const GLYPHS = '!<>-_\\/[]{}=+*^?#01NULL';
  function scramble(el) {
    if (reduceMotion || el.dataset.scrambling) return;
    const final = el.dataset.text || el.textContent;
    el.dataset.text = final;
    el.dataset.scrambling = '1';
    const len = final.length;
    const start = performance.now();
    const dur = Math.min(900, 280 + len * 38);
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      let out = '';
      for (let i = 0; i < len; i++) {
        const ch = final[i];
        const settle = (i / len) * 0.7 + 0.3;
        if (ch === ' ' || t >= settle) out += ch;
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(step);
      else { el.textContent = final; delete el.dataset.scrambling; }
    }
    requestAnimationFrame(step);
  }
  $$('[data-scramble]').forEach(el => {
    el.setAttribute('aria-label', el.textContent.trim());
    if (el.dataset.scramble !== 'hover') scramble(el);
    if (finePointer) {
      const host = el.closest('a, .lane, .proj, button') || el;
      host.addEventListener('mouseenter', () => scramble(el));
    }
  });
  if (finePointer) {
    $$('.nav-links a:not(.nav-cta) .nav-text').forEach(el => {
      el.closest('a').addEventListener('mouseenter', () => scramble(el));
    });
  }

  /* ── REVEAL ON SCROLL ── */
  const autoReveal = [
    '.section-label', '.section-title', '.section-rule', '.lane', '.proj', '.feature-card',
    '.stat', '.index-tile', '.link-item', '.about-text > *', '.about-aside',
    '.lane-hero-inner > *', '.next-lane', '.loop-step', '.bench-card', '.cs-section .section-inner > *',
    '.psyphi-project .section-inner > *', '.psyphi-hero-body', '.cs-meta-strip', '.cs-deck', '.footer-cta > *',
    '.clients-intro', '.client-step', '.clients-quote-row', '.clients-timeline li'
  ].join(',');
  $$(autoReveal).forEach(el => { if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', ''); });
  // Stagger siblings
  $$('[data-reveal]').forEach(el => {
    const sibs = Array.from(el.parentElement.children).filter(c => c.hasAttribute('data-reveal'));
    const i = sibs.indexOf(el);
    el.style.setProperty('--d', Math.min(i, 8) * 70 + 'ms');
  });
  if (reduceMotion || !('IntersectionObserver' in window)) {
    $$('[data-reveal]').forEach(el => el.classList.add('is-in'));
  } else {
    const rio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          rio.unobserve(e.target);
          e.target.querySelectorAll('[data-scramble="view"]').forEach(scramble);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('[data-reveal]').forEach(el => rio.observe(el));
  }

  /* ── COUNT UP ── */
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    if (reduceMotion) { el.textContent = prefix + target + suffix; return; }
    const start = performance.now();
    const dur = 1400;
    (function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.6 });
    $$('[data-count]').forEach(el => cio.observe(el));
  }

  /* ── TRY-SRC MEDIA : drop a file in and it appears, otherwise keep the placeholder ── */
  $$('[data-try-src]').forEach(box => {
    const src = box.dataset.trySrc;
    const isVideo = /\.(mp4|webm|mov)$/i.test(src);
    if (isVideo) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.addEventListener('loadeddata', () => {
        box.querySelectorAll('.media-placeholder').forEach(p => p.remove());
        box.classList.add('has-media');
        box.appendChild(v);
        watchVideo(v);
      }, { once: true });
      v.src = src;
    } else {
      const img = new Image();
      img.alt = box.dataset.alt || '';
      img.loading = 'lazy';
      img.onload = () => {
        box.querySelectorAll('.media-placeholder').forEach(p => p.remove());
        box.classList.add('has-media');
        box.appendChild(img);
      };
      img.src = src;
    }
  });

  /* ── VIDEOS : load near view, play in view, pause out of view ── */
  let vio = null;
  if ('IntersectionObserver' in window) {
    vio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const v = e.target;
        if (e.isIntersecting) {
          if (v.dataset.src && !v.getAttribute('src')) { v.src = v.dataset.src; }
          if (v.hasAttribute('data-autoplay') && !reduceMotion) {
            const p = v.play(); if (p && p.catch) p.catch(() => {});
          }
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: '200px 0px', threshold: 0.01 });
  }
  function watchVideo(v) {
    if (!v.hasAttribute('data-autoplay')) v.setAttribute('data-autoplay', '');
    if (vio) vio.observe(v);
  }
  $$('video[data-autoplay], video[data-src]').forEach(watchVideo);
  // Gallery tiles: play on hover only (keeps busy pages calm)
  $$('.psyphi-tile video, .gallery-tile video').forEach(v => {
    if (v.hasAttribute('data-autoplay')) return;
    const tile = v.closest('figure, .gallery-tile');
    if (!tile || !finePointer) return;
    tile.addEventListener('mouseenter', () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); });
    tile.addEventListener('mouseleave', () => v.pause());
  });

  /* ── LITE YOUTUBE : thumbnail until clicked, then the real player in place ── */
  $$('[data-youtube-inline]').forEach(box => {
    box.addEventListener('click', () => {
      const id = box.dataset.youtubeInline;
      box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="' + (box.dataset.title || 'Video') +
        '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ' +
        'referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      box.classList.add('is-playing');
    }, { once: true });
  });

  /* ── SPOTLIGHT : a soft light that follows the cursor across cards ── */
  if (finePointer && !reduceMotion) {
    $$('.lane, .proj, .link-item, .index-tile, .feature-card, .bench-card, .stat, .next-lane, .about-aside, .client-step').forEach(el => {
      el.classList.add('has-spot');
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ── TILT : media panels lean toward the cursor ── */
  if (finePointer && !reduceMotion) {
    $$('[data-tilt]').forEach(el => {
      let raf = 0;
      el.addEventListener('pointermove', e => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          el.style.setProperty('--rx', (-py * 5).toFixed(2) + 'deg');
          el.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
          el.style.setProperty('--gx', ((px + 0.5) * 100).toFixed(1) + '%');
          el.style.setProperty('--gy', ((py + 0.5) * 100).toFixed(1) + '%');
        });
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ── MAGNETIC BUTTONS ── */
  if (finePointer && !reduceMotion) {
    $$('.btn, .magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + (x * 0.22).toFixed(1) + 'px,' + (y * 0.3).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ── HOME : scrollspy for lanes ── */
  const laneLinks = $$('.nav-links a[data-lane]');
  const lanes = laneLinks.map(a => document.getElementById(a.dataset.lane)).filter(Boolean);
  if (lanes.length && 'IntersectionObserver' in window) {
    const sio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        laneLinks.forEach(a => a.classList.toggle('is-active', a.dataset.lane === e.target.id));
        doc.style.setProperty('--live-accent', getComputedStyle(e.target).getPropertyValue('--accent'));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    lanes.forEach(l => sio.observe(l));
  }

  /* ── RESUME : only show the button if resume.pdf has been added ── */
  const resumeLinks = $$('[data-resume]');
  if (resumeLinks.length && location.protocol !== 'file:') {
    fetch(resumeLinks[0].getAttribute('href'), { method: 'HEAD' })
      .then(r => { if (r.ok) resumeLinks.forEach(a => a.hidden = false); })
      .catch(() => {});
  }

  /* ── HERO : title replays its scramble on click, content drifts with the mouse ── */
  const heroContent = $('.hero-content');
  if (heroContent && finePointer && !reduceMotion) {
    window.addEventListener('pointermove', e => {
      if (window.scrollY > window.innerHeight) return;
      const x = (e.clientX / window.innerWidth - 0.5) * -14;
      const y = (e.clientY / window.innerHeight - 0.5) * -10;
      heroContent.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }, { passive: true });
  }

  /* ── OVERLAY (click to expand) ── */
  const overlay = document.getElementById('videoOverlay');
  if (!overlay) return;

  function closeOverlay() {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    setTimeout(() => { overlay.innerHTML = ''; }, 250);
  }
  function openOverlay(innerHTML, caption) {
    overlay.innerHTML =
      '<div class="video-stage">' +
      '<button class="video-close" type="button" aria-label="Close">Close</button>' +
      innerHTML +
      (caption ? '<p class="overlay-caption">' + escapeAttr(caption) + '</p>' : '') +
      '</div>';
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('.video-close').addEventListener('click', closeOverlay);
    overlay.querySelector('.video-close').focus({ preventScroll: true });
  }
  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function ytFrame(id, title) {
    return '<iframe src="https://www.youtube-nocookie.com/embed/' + escapeAttr(id) +
      '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="' + escapeAttr(title || 'Video') + '" ' +
      'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ' +
      'referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  }

  document.addEventListener('click', e => {
    const card = e.target.closest('[data-expand]');
    if (!card) return;
    const inner = e.target.closest('a, .btn');
    if (inner && inner !== card && card.contains(inner)) return;
    const caption = card.dataset.caption || (card.querySelector('figcaption') || {}).textContent || '';
    if (card.dataset.youtube) { openOverlay(ytFrame(card.dataset.youtube, card.dataset.title), ''); return; }
    if (card.dataset.full) {
      const src = card.dataset.full;
      const type = /\.webm$/i.test(src) ? 'video/webm' : 'video/mp4';
      openOverlay('<video autoplay loop controls playsinline><source src="' + escapeAttr(src) + '" type="' + type + '"></video>', caption);
      return;
    }
    const video  = card.querySelector('video');
    const iframe = card.querySelector('iframe');
    const img    = card.querySelector('img');
    if (video) {
      const sourceEl = video.querySelector('source');
      const src  = (sourceEl && sourceEl.getAttribute('src')) || video.getAttribute('src') || video.dataset.src;
      if (!src) return;
      const type = /\.webm$/i.test(src) ? 'video/webm' : 'video/mp4';
      openOverlay('<video autoplay loop controls playsinline><source src="' + escapeAttr(src) + '" type="' + type + '"></video>', caption);
    } else if (iframe) {
      openOverlay('<iframe src="' + escapeAttr(iframe.getAttribute('src')) + '" title="' + escapeAttr(iframe.getAttribute('title') || 'Video') + '" ' +
        'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>', '');
    } else if (img) {
      openOverlay('<img src="' + escapeAttr(img.getAttribute('src')) + '" alt="' + escapeAttr(img.getAttribute('alt') || '') + '">', caption);
    }
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeOverlay();
  });
})();
