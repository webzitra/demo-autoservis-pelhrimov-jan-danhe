(function() {
    'use strict';

    // ── Sticky Navbar ──
    var navbar = document.getElementById('navbar');

    // ── Mobile Menu ──
    var navToggle = document.getElementById('nav-toggle');
    var navMenu = document.getElementById('nav-menu');
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            var isOpen = navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
            // On mobile, force scrolled look when menu is open (dark logo + dark links)
            if (navbar && isOpen && window.scrollY <= 50) {
                navbar.classList.add('menu-open');
            } else if (navbar) {
                navbar.classList.remove('menu-open');
            }
        });
        navMenu.querySelectorAll('.nav-link').forEach(function(link) {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
                if (navbar) navbar.classList.remove('menu-open');
            });
        });
    }
    if (navbar) {
        window.addEventListener('scroll', function() {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        }, { passive: true });
    }

    // ── Smooth Scroll ──
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // ── Scroll Animations ──
    var animElements = document.querySelectorAll('[data-animate]');
    if (animElements.length > 0 && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
        animElements.forEach(function(el) { observer.observe(el); });
    }

    // ── FAQ Accordion (only one open at a time) ──
    document.querySelectorAll('.faq-item').forEach(function(item) {
        item.addEventListener('toggle', function() {
            if (this.open) {
                document.querySelectorAll('.faq-item').forEach(function(other) {
                    if (other !== item) other.removeAttribute('open');
                });
            }
        });
    });

    // ── Gallery Lightbox ──
    var lightbox = document.getElementById('lightbox');
    var lightboxImg = lightbox ? lightbox.querySelector('img') : null;

    if (lightbox && lightboxImg) {
        // Open lightbox on gallery image click
        document.querySelectorAll('.gallery-card').forEach(function(card) {
            card.addEventListener('click', function() {
                var img = card.querySelector('img');
                if (img) {
                    lightboxImg.src = img.src;
                    lightboxImg.alt = img.alt;
                    lightbox.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            });
        });

        // Close lightbox on backdrop click
        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
                closeLightbox();
            }
        });

        // Close lightbox on close button click
        var closeBtn = lightbox.querySelector('.lightbox-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeLightbox();
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });

        function closeLightbox() {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // ── Contact Form ──
    var form = document.querySelector('.contact-form');
    if (form) {
        form.addEventListener('submit', function() {
            var btn = form.querySelector('button[type="submit"]');
            btn.textContent = 'Odesílání...';
            btn.disabled = true;
            setTimeout(function() {
                btn.textContent = 'Odeslat zprávu';
                btn.disabled = false;
            }, 3000);
        });
    }

    // ── Cookie Banner ──
    var banner = document.getElementById('cookie-banner');
    if (banner && !localStorage.getItem('cookies-consent')) {
        banner.hidden = false;
    }
    var acceptBtn = document.getElementById('cookie-accept');
    var rejectBtn = document.getElementById('cookie-reject');
    if (acceptBtn) acceptBtn.addEventListener('click', function() { localStorage.setItem('cookies-consent', 'accepted'); banner.hidden = true; });
    if (rejectBtn) rejectBtn.addEventListener('click', function() { localStorage.setItem('cookies-consent', 'rejected'); banner.hidden = true; });

    // ── Scroll to Top ──
    var scrollTopBtn = document.getElementById('scroll-top');
    if (scrollTopBtn) {
        window.addEventListener('scroll', function() {
            scrollTopBtn.classList.toggle('visible', window.scrollY > 600);
        }, { passive: true });
        scrollTopBtn.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ── Animated Counter ──
    var counterEls = document.querySelectorAll('[data-count]');
    if (counterEls.length > 0 && 'IntersectionObserver' in window) {
        var counterObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var el = entry.target;
                    var target = parseInt(el.getAttribute('data-count'), 10);
                    var suffix = el.getAttribute('data-suffix') || '';
                    var duration = 2000;
                    var start = performance.now();
                    function animate(now) {
                        var elapsed = now - start;
                        var progress = Math.min(elapsed / duration, 1);
                        var eased = 1 - Math.pow(1 - progress, 3);
                        el.textContent = Math.round(target * eased) + suffix;
                        if (progress < 1) requestAnimationFrame(animate);
                    }
                    requestAnimationFrame(animate);
                    counterObserver.unobserve(el);
                }
            });
        }, { threshold: 0.3 });
        counterEls.forEach(function(el) { counterObserver.observe(el); });
    }

})();
