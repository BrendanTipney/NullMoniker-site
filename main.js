// Shared scripts: nav burger + click-to-expand overlay.
(() => {
  const burger = document.getElementById('navBurger');
  const links  = document.getElementById('navLinks');
  if (burger && links) {
    burger.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  const overlay = document.getElementById('videoOverlay');
  if (!overlay) return;

  function closeOverlay() {
    overlay.classList.remove('active');
    setTimeout(() => { overlay.innerHTML = ''; }, 250);
  }

  function openOverlay(innerHTML) {
    overlay.innerHTML =
      '<div class="video-stage">' +
      '<button class="video-close" type="button" aria-label="Close">Close</button>' +
      innerHTML +
      '</div>';
    overlay.classList.add('active');
    overlay.querySelector('.video-close').addEventListener('click', closeOverlay);
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  document.querySelectorAll('[data-expand]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, .btn')) return;
      const video  = card.querySelector('video');
      const iframe = card.querySelector('iframe');
      const img    = card.querySelector('img');
      if (video) {
        const sourceEl = video.querySelector('source');
        const src  = sourceEl ? sourceEl.getAttribute('src')  : video.getAttribute('src');
        const type = sourceEl ? sourceEl.getAttribute('type') : 'video/mp4';
        openOverlay(
          '<video autoplay loop controls playsinline>' +
          '<source src="' + escapeAttr(src) + '" type="' + escapeAttr(type) + '">' +
          '</video>'
        );
      } else if (iframe) {
        const src   = iframe.getAttribute('src');
        const title = iframe.getAttribute('title') || 'Video';
        openOverlay(
          '<iframe src="' + escapeAttr(src) + '" title="' + escapeAttr(title) + '" ' +
          'allow="autoplay; encrypted-media; picture-in-picture; fullscreen" ' +
          'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>'
        );
      } else if (img) {
        const src = img.getAttribute('src');
        const alt = img.getAttribute('alt') || '';
        openOverlay('<img src="' + escapeAttr(src) + '" alt="' + escapeAttr(alt) + '">');
      }
    });
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeOverlay();
  });
})();
