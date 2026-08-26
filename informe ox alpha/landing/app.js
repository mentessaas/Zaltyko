/* Zaltyko · Informe para accionistas — motor de motion */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- utilidad count-up ---------- */
  function countUp(el, target, suffix) {
    var dur = 1200, start = null;
    function frame(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString("es-ES") + (suffix || "");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- nav + progreso ---------- */
  var nav = document.getElementById("nav");
  var bar = document.getElementById("progressBar");
  function onScroll() {
    var h = document.documentElement;
    nav.classList.toggle("scrolled", window.scrollY > 24);
    var max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- hero: titular palabra a palabra ---------- */
  var title = document.getElementById("heroTitle");
  if (title && !reduce) {
    var words = title.textContent.trim().split(/\s+/);
    var hlStart = words.indexOf("momento");
    title.textContent = "";
    words.forEach(function (w, i) {
      var span = document.createElement("span");
      span.className = "word" + (i >= hlStart ? " hl" : "");
      span.style.setProperty("--i", i);
      span.textContent = w;
      title.appendChild(span);
      if (i < words.length - 1) title.appendChild(document.createTextNode(" "));
    });
  }

  /* ---------- parallax de glows ---------- */
  var parallaxEls = Array.prototype.slice.call(document.querySelectorAll(".parallax"));
  var heroGlowRaf = null;
  function parallax() {
    heroGlowRaf = null;
    var y = window.scrollY;
    parallaxEls.forEach(function (el) {
      el.style.transform = "translateY(" + y * parseFloat(el.dataset.speed || 0.3) + "px)";
    });
  }
  if (!reduce && parallaxEls.length) {
    document.addEventListener("scroll", function () {
      if (!heroGlowRaf) heroGlowRaf = requestAnimationFrame(parallax);
    }, { passive: true });
  }

  /* ---------- cursor glow en hero ---------- */
  var hero = document.getElementById("hero");
  var cGlow = document.getElementById("cursorGlow");
  if (hero && cGlow && fine && !reduce) {
    var gx = 0, gy = 0, tx = 0, ty = 0, glowRaf = null;
    function glowLoop() {
      gx = lerp(gx, tx, 0.08);
      gy = lerp(gy, ty, 0.08);
      cGlow.style.transform = "translate(" + gx + "px," + gy + "px)";
      if (Math.abs(gx - tx) > 0.5 || Math.abs(gy - ty) > 0.5) {
        glowRaf = requestAnimationFrame(glowLoop);
      } else { glowRaf = null; }
    }
    hero.addEventListener("mousemove", function (e) {
      var r = hero.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top;
      if (!glowRaf) glowRaf = requestAnimationFrame(glowLoop);
    });
  }

  /* ---------- botones magnéticos ---------- */
  if (fine && !reduce) {
    document.querySelectorAll(".magnetic").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = "translate(" + dx * 0.18 + "px," + dy * 0.28 + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
      });
    });
  }

  /* ---------- marquee: duplicar contenido para bucle continuo ---------- */
  var track = document.getElementById("marqueeTrack");
  if (track) track.innerHTML += track.innerHTML;

  /* ---------- reveal escalonado ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  revealEls.forEach(function (el) { el.classList.add("reveal"); });
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var sibs = Array.prototype.filter.call(
          e.target.parentNode.children,
          function (c) { return c.classList && c.classList.contains("reveal"); }
        );
        e.target.style.transitionDelay = Math.min(sibs.indexOf(e.target), 5) * 80 + "ms";
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- cifras pinned: pasos por scroll ---------- */
  var pinsec = document.querySelector(".pinsec");
  var panels = document.querySelectorAll(".pin-panel");
  var dots = document.querySelectorAll(".pin-dots .dot");
  var counted = {};
  function pinStep() {
    var rect = pinsec.getBoundingClientRect();
    var vh = window.innerHeight;
    var total = rect.height - vh;
    var progress = Math.min(Math.max(-rect.top / total, 0), 0.9999);
    var step = Math.floor(progress * panels.length);
    panels.forEach(function (p, i) { p.classList.toggle("active", i === step); });
    dots.forEach(function (d, i) { d.classList.toggle("active", i === step); });
    var num = panels[step].querySelector(".pin-num");
    var key = num.dataset.count + num.dataset.suffix;
    if (!counted[key]) {
      counted[key] = true;
      countUp(num, parseInt(num.dataset.count, 10), num.dataset.suffix || "");
    }
  }
  if (pinsec && panels.length) {
    if (!reduce && window.innerWidth > 960) {
      document.addEventListener("scroll", function () {
        requestAnimationFrame(pinStep);
      }, { passive: true });
      pinStep();
    } else {
      // móvil / reduced: apilado estático con contadores al entrar
      panels.forEach(function (p) { p.classList.add("active"); });
      if ("IntersectionObserver" in window) {
        var ioPins = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            var num = e.target.querySelector(".pin-num");
            var key = num.dataset.count + num.dataset.suffix;
            if (!counted[key]) {
              counted[key] = true;
              if (reduce) {
                num.textContent = parseInt(num.dataset.count, 10).toLocaleString("es-ES") + (num.dataset.suffix || "");
              } else {
                countUp(num, parseInt(num.dataset.count, 10), num.dataset.suffix || "");
              }
            }
            ioPins.unobserve(e.target);
          });
        }, { threshold: 0.3 });
        panels.forEach(function (p) { ioPins.observe(p); });
      }
    }
  }

  /* ---------- barras de severidad ---------- */
  var sevChart = document.querySelector(".sev-chart");
  if (sevChart && "IntersectionObserver" in window) {
    var ioSev = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        sevChart.querySelectorAll(".sev-bar").forEach(function (b, i) {
          b.style.transitionDelay = i * 120 + "ms";
          b.style.width = b.dataset.w + "%";
        });
        sevChart.querySelectorAll(".sev-val").forEach(function (v) {
          countUp(v, parseInt(v.dataset.count, 10), "");
        });
        ioSev.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    ioSev.observe(sevChart);
  } else if (sevChart) {
    sevChart.querySelectorAll(".sev-bar").forEach(function (b) { b.style.width = b.dataset.w + "%"; });
    sevChart.querySelectorAll(".sev-val").forEach(function (v) {
      v.textContent = v.dataset.count;
    });
  }

  /* ---------- barras de score ---------- */
  function fillScore(score) {
    var v = parseFloat(score.dataset.score || "0");
    var fill = score.querySelector(".score-fill");
    if (fill) fill.style.width = (v / 10) * 100 + "%";
  }
  if ("IntersectionObserver" in window && !reduce) {
    var ioScores = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        fillScore(e.target);
        ioScores.unobserve(e.target);
      });
    }, { threshold: 0.35 });
    document.querySelectorAll(".score").forEach(function (el) { ioScores.observe(el); });
  } else {
    document.querySelectorAll(".score").forEach(fillScore);
  }

  /* ---------- tilt 3D ---------- */
  if (fine && !reduce) {
    document.querySelectorAll(".tilt").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          "perspective(800px) rotateX(" + (-py * 7) + "deg) rotateY(" + (px * 9) + "deg) translateY(-3px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ---------- línea de progreso del roadmap ---------- */
  var timeline = document.getElementById("timeline");
  var tlProgress = document.getElementById("tlProgress");
  function tlStep() {
    var r = timeline.getBoundingClientRect();
    var vh = window.innerHeight;
    var progress = Math.min(Math.max((vh * 0.7 - r.top) / r.height, 0), 1);
    tlProgress.style.height = progress * 100 + "%";
  }
  if (timeline && tlProgress && !reduce) {
    document.addEventListener("scroll", function () { requestAnimationFrame(tlStep); }, { passive: true });
    tlStep();
  } else if (tlProgress) {
    tlProgress.style.height = "100%";
  }

  /* ---------- imprimir / PDF ---------- */
  var printBtn = document.getElementById("printBtn");
  if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
})();
