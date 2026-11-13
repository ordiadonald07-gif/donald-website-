(() => {
  "use strict";
  if (window.__donaldSmoothNavigation) return;
  window.__donaldSmoothNavigation = true;

  const cache = new Map();
  let activeRequest = 0;
  const routePath = value => {
    const url = new URL(value, window.location.href);
    let path = url.pathname.replace(/\\/{2,}/g, "/");
    if (path !== "/" && !path.endsWith(".html") && !path.endsWith("/")) path += "/";
    return path;
  };
  const isInternalPage = link => {
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;
    if (link.dataset.noSpa !== undefined) return false;
    const url = new URL(link.href, window.location.href);
    return url.origin === window.location.origin &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.hash &&
      routePath(url.href) !== routePath(window.location.href);
  };
  const getPage = url => {
    const key = routePath(url);
    if (!cache.has(key)) {
      cache.set(key, fetch(key, {
        credentials: "same-origin",
        headers: { "X-Requested-With": "DonaldSmoothNavigation" }
      }).then(response => {
        if (!response.ok) throw new Error("Page request failed: " + response.status);
        return response.text();
      }).then(html => new DOMParser().parseFromString(html, "text/html")));
    }
    return cache.get(key);
  };
  const updateNavigation = path => {
    document.querySelectorAll(".nav-links a").forEach(link => {
      const active = routePath(link.href) === path;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const nav = document.getElementById("navLinks");
    const toggle = document.getElementById("menuToggle");
    if (nav) nav.classList.remove("open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "☰";
    }
  };
  const observeReveals = root => {
    const elements = root.querySelectorAll ? root.querySelectorAll(".reveal") : [];
    if (!("IntersectionObserver" in window)) {
      elements.forEach(element => element.classList.add("visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach(element => observer.observe(element));
  };
  const bindContactForm = root => {
    const form = root.querySelector("#contactForm");
    if (!form || form.dataset.smoothBound) return;
    form.dataset.smoothBound = "true";
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = new FormData(form);
      const subject = encodeURIComponent("New project enquiry — " + data.get("service"));
      const body = encodeURIComponent(
        "Name: " + data.get("name") +
        "\\nEmail: " + data.get("email") +
        "\\nService: " + data.get("service") +
        "\\n\\nProject details:\\n" + data.get("message")
      );
      window.location.href = "mailto:ordiadonald07@gmail.com?subject=" + subject + "&body=" + body;
    });
  };
  const setMetadata = page => {
    document.title = page.title || document.title;
    const nextDescription = page.querySelector('meta[name="description"]');
    let description = document.querySelector('meta[name="description"]');
    if (nextDescription) {
      if (!description) {
        description = document.createElement("meta");
        description.name = "description";
        document.head.appendChild(description);
      }
      description.content = nextDescription.content;
    }
  };
  const swapPage = async (url, { scrollY = 0, useTransition = true } = {}) => {
    const requestId = ++activeRequest;
    const currentMain = document.querySelector("main");
    if (!currentMain) {
      window.location.assign(url);
      return;
    }
    let page;
    try {
      page = await getPage(url);
    } catch (error) {
      cache.delete(routePath(url));
      window.location.assign(url);
      return;
    }
    if (requestId !== activeRequest) return;
    const incomingMain = page.querySelector("main");
    if (!incomingMain) {
      window.location.assign(url);
      return;
    }
    const nextMain = document.importNode(incomingMain, true);
    nextMain.classList.add("spa-page");
    const commit = () => {
      const liveMain = document.querySelector("main");
      if (liveMain) liveMain.replaceWith(nextMain);
      setMetadata(page);
      updateNavigation(routePath(url));
      observeReveals(nextMain);
      bindContactForm(nextMain);
    };
    if (useTransition && document.startViewTransition) {
      try {
        await document.startViewTransition(commit).finished;
      } catch (_) {
        commit();
      }
    } else {
      const liveMain = document.querySelector("main");
      if (liveMain) {
        liveMain.classList.add("spa-leaving");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (requestId !== activeRequest) return;
      commit();
      nextMain.classList.add("spa-entering");
      requestAnimationFrame(() => {
        nextMain.classList.remove("spa-entering");
      });
    }
    window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    const heading = nextMain.querySelector("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  };

  const style = document.createElement("style");
  style.textContent = `
    main.spa-page { view-transition-name: page-content; }
    ::view-transition-old(page-content) { animation: donald-page-out .16s ease both; }
    ::view-transition-new(page-content) { animation: donald-page-in .22s ease both; }
    @keyframes donald-page-out { to { opacity: 0; transform: translateY(-5px); } }
    @keyframes donald-page-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
    main.spa-leaving { opacity: 0; transform: translateY(-4px); transition: opacity .1s ease, transform .1s ease; }
    main.spa-entering { opacity: 0; transform: translateY(7px); }
    main.spa-page { transition: opacity .18s ease, transform .18s ease; }
    @media (prefers-reduced-motion: reduce) {
      ::view-transition-old(page-content), ::view-transition-new(page-content) { animation: none !important; }
      main.spa-page, main.spa-leaving, main.spa-entering { transition: none !important; transform: none !important; }
    }
  `;
  document.head.appendChild(style);
  const initialMain = document.querySelector("main");
  if (initialMain) initialMain.classList.add("spa-page");
  updateNavigation(routePath(window.location.href));
  observeReveals(document);

  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!isInternalPage(link)) return;
    event.preventDefault();
    const destination = new URL(link.href, window.location.href);
    history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, "");
    history.pushState({ scrollY: 0 }, "", destination.pathname + destination.search);
    swapPage(destination.href, { scrollY: 0 });
  });

  document.addEventListener("pointerover", event => {
    const link = event.target.closest("a[href]");
    if (isInternalPage(link)) getPage(link.href).catch(() => cache.delete(routePath(link.href)));
  }, { passive: true });
  document.addEventListener("focusin", event => {
    const link = event.target.closest("a[href]");
    if (isInternalPage(link)) getPage(link.href).catch(() => cache.delete(routePath(link.href)));
  });
  window.addEventListener("popstate", event => {
    swapPage(window.location.href, { scrollY: event.state && Number.isFinite(event.state.scrollY) ? event.state.scrollY : 0 });
  });
})();
