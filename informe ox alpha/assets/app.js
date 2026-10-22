/* Informe Ox Alpha — interacción mínima: scroll-spy, progreso,
   reveal de secciones, animación de barras y filtro de hallazgos. */

(function () {
  "use strict";

  /* ---------- reveal + barras ---------- */
  const sections = document.querySelectorAll("section");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    sections.forEach((s) => io.observe(s));
  } else {
    sections.forEach((s) => s.classList.add("is-visible"));
  }

  /* ---------- barra de progreso ---------- */
  const bar = document.getElementById("progressBar");
  function onScroll() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- scroll-spy del índice ---------- */
  const links = Array.from(document.querySelectorAll(".toc a"));
  const byId = new Map(
    links.map((a) => [decodeURIComponent(a.hash.slice(1)), a])
  );
  function spy() {
    let current = null;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= 140) current = section.id;
    }
    links.forEach((a) => a.classList.remove("active"));
    if (current && byId.has(current)) byId.get(current).classList.add("active");
    else if (links[0]) links[0].classList.add("active");
  }
  document.addEventListener("scroll", spy, { passive: true });
  spy();

  /* ---------- filtros y búsqueda en tablas .findings ---------- */
  const chips = Array.from(document.querySelectorAll(".chip"));
  const search = document.getElementById("q");
  let sev = "all";

  function applyFilters() {
    const q = search ? search.value.trim().toLowerCase() : "";
    document.querySelectorAll("table.findings").forEach((table) => {
      table.querySelectorAll("tbody tr").forEach((row) => {
        const rowSev = row.dataset.sev || "";
        const text = row.textContent.toLowerCase();
        const okSev = sev === "all" || rowSev === sev;
        const okText = !q || text.includes(q);
        row.hidden = !(okSev && okText);
      });
    });
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      sev = chip.dataset.sev;
      chips.forEach((c) => c.classList.toggle("is-on", c === chip));
      applyFilters();
    });
  });
  if (search) {
    search.addEventListener("input", applyFilters);
    // Atajo: "/" enfoca la búsqueda
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== search) {
        e.preventDefault();
        search.focus();
      }
    });
  }
})();
