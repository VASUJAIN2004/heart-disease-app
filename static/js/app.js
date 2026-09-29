(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const form = $("#risk-form");
  if (!form) return;

  const sheet = $("#sheet");
  const steps = $$(".step", form);
  const railSteps = $$(".rail__step");
  const btnNext = $("#btn-next");
  const btnBack = $("#btn-back");
  const formError = $("#form-error");
  const loading = $("#loading");
  const result = $("#result");
  const TOTAL = steps.length;

  let current = 1;
  let visited = 1;

  /* ── Wording ─────────────────────────────────────────────── */
  const TEXT = {
    Sex: { M: "Male", F: "Female" },
    ChestPainType: { TA: "Typical angina", ATA: "Atypical angina", NAP: "Non-anginal pain", ASY: "No chest pain" },
    FastingBS: { 1: "Above 120", 0: "120 or below" },
    RestingECG: { Normal: "Normal", ST: "ST-T abnormality", LVH: "LV hypertrophy" },
    ExerciseAngina: { Y: "Yes", N: "No" },
    ST_Slope: { Up: "Upsloping", Flat: "Flat", Down: "Downsloping" },
  };

  const LABEL = {
    Age: "Age",
    Sex: "Sex",
    ChestPainType: "Chest pain",
    RestingBP: "Resting blood pressure",
    Cholesterol: "Cholesterol",
    FastingBS: "Fasting blood sugar",
    RestingECG: "Resting ECG",
    MaxHR: "Maximum heart rate",
    ExerciseAngina: "Pain during exercise",
    Oldpeak: "ST depression",
    ST_Slope: "ST slope",
  };

  const UNIT = { Age: " years", RestingBP: " mm Hg", Cholesterol: " mg/dL", MaxHR: " bpm", Oldpeak: " mm" };

  // Which step each question lives on (used to hide unanswered rows in the summary).
  const STEP_OF = {
    Age: 1, Sex: 1,
    ChestPainType: 2, RestingBP: 2, Cholesterol: 2, FastingBS: 2, RestingECG: 2,
    MaxHR: 3, ExerciseAngina: 3, Oldpeak: 3, ST_Slope: 3,
  };

  const RULES = {
    Age: { min: 18, max: 100, text: "Enter an age between 18 and 100." },
    RestingBP: { min: 70, max: 250, text: "Enter a blood pressure between 70 and 250 mm Hg." },
    Cholesterol: { min: 80, max: 700, text: "Enter a cholesterol level between 80 and 700 mg/dL, or tick the box if you don't know it." },
    MaxHR: { min: 60, max: 220, text: "Enter a heart rate between 60 and 220 bpm." },
    Oldpeak: { min: -3, max: 8, text: "Enter a value between -3 and 8." },
  };

  const CHOICES = ["Sex", "ChestPainType", "FastingBS", "RestingECG", "ExerciseAngina", "ST_Slope"];

  /* ── Sliders paired with number boxes ────────────────────── */
  $$(".range__slider").forEach((slider) => {
    const box = document.getElementById(slider.dataset.pair);

    const paint = () => {
      const min = Number(slider.min);
      const max = Number(slider.max);
      const pct = ((Number(slider.value) - min) / (max - min)) * 100;
      slider.style.setProperty("--p", `${pct}%`);
    };

    slider.addEventListener("input", () => {
      box.value = slider.value;
      paint();
      afterChange(box.name);
    });
    box.addEventListener("input", () => {
      if (box.value !== "") slider.value = box.value;
      paint();
      afterChange(box.name);
    });
    slider._paint = paint;
    paint();
  });

  /* ── Cholesterol: "I don't know" ─────────────────────────── */
  const cholUnknown = $("#chol-unknown");
  const applyCholUnknown = () => {
    const off = cholUnknown.checked;
    $("#Cholesterol").disabled = off;
    $('[data-pair="Cholesterol"]').disabled = off;
    $("#chol-range").classList.toggle("is-off", off);
    if (off) clearError("Cholesterol");
  };
  cholUnknown.addEventListener("change", () => {
    applyCholUnknown();
    afterChange("Cholesterol");
  });

  /* ── Heart that beats at the chosen max heart rate ───────── */
  const bpmHeart = $("#bpm-heart");
  const syncBeat = () => {
    const bpm = Math.min(Math.max(Number($("#MaxHR").value) || 150, 40), 240);
    bpmHeart.style.setProperty("--beat", `${(60 / bpm).toFixed(3)}s`);
  };

  /* ── Reading answers ─────────────────────────────────────── */
  const asNumber = (value) => (value === undefined || value === "" ? null : Number(value));

  function readAnswers() {
    const data = new FormData(form);
    const get = (name) => data.get(name);
    return {
      Age: asNumber(get("Age")),
      Sex: get("Sex"),
      ChestPainType: get("ChestPainType"),
      RestingBP: asNumber(get("RestingBP")),
      Cholesterol: cholUnknown.checked ? null : asNumber(get("Cholesterol")),
      FastingBS: get("FastingBS") === null ? null : Number(get("FastingBS")),
      RestingECG: get("RestingECG"),
      MaxHR: asNumber(get("MaxHR")),
      ExerciseAngina: get("ExerciseAngina"),
      Oldpeak: asNumber(get("Oldpeak")),
      ST_Slope: get("ST_Slope"),
    };
  }

  function describe(name, answers) {
    const value = answers[name];
    if (name === "Cholesterol" && value === null) return "Not known";
    if (value === null || value === undefined || value === "") return "";
    if (TEXT[name]) return TEXT[name][value] || "";
    return `${value}${UNIT[name] || ""}`;
  }

  function updateSummary() {
    const answers = readAnswers();
    $$("[data-sum]").forEach((dd) => {
      const name = dd.dataset.sum;
      dd.textContent = STEP_OF[name] <= visited ? describe(name, answers) : "";
    });
  }

  function afterChange(name) {
    if (name) clearError(name);
    if (name === "MaxHR") syncBeat();
    formError.hidden = true;
    updateSummary();
  }

  form.addEventListener("change", (event) => {
    if (event.target.type === "radio") afterChange(event.target.name);
  });

  /* ── Validation ──────────────────────────────────────────── */
  const fieldEl = (name) => $(`.field[data-field="${name}"]`, form);

  function showError(name, message) {
    const field = fieldEl(name);
    if (!field) return null;
    field.classList.add("has-error");
    $(".field__error", field).textContent = message;
    return field;
  }

  function clearError(name) {
    const field = fieldEl(name);
    if (!field) return;
    field.classList.remove("has-error");
    $(".field__error", field).textContent = "";
  }

  function validateStep(n) {
    const answers = readAnswers();
    let firstBad = null;

    Object.keys(STEP_OF)
      .filter((name) => STEP_OF[name] === n)
      .forEach((name) => {
        let message = "";
        if (CHOICES.includes(name)) {
          if (answers[name] === null || answers[name] === undefined) message = "Choose one option.";
        } else if (RULES[name] && !(name === "Cholesterol" && cholUnknown.checked)) {
          const value = answers[name];
          if (value === null || Number.isNaN(value) || value < RULES[name].min || value > RULES[name].max) {
            message = RULES[name].text;
          }
        }
        if (message) {
          const field = showError(name, message);
          firstBad = firstBad || field;
        } else {
          clearError(name);
        }
      });

    if (firstBad) {
      const focusable = $("input:not([disabled])", firstBad);
      if (focusable) focusable.focus({ preventScroll: false });
      return false;
    }
    return true;
  }

  /* ── Steps ───────────────────────────────────────────────── */
  function scrollSheetIntoView() {
    if (sheet.getBoundingClientRect().top < 0) {
      sheet.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function showStep(n, direction = "forward", { focus = true } = {}) {
    current = n;
    visited = Math.max(visited, n);

    steps.forEach((step) => {
      const active = Number(step.dataset.step) === n;
      step.hidden = !active;
      step.classList.remove("is-entering", "is-entering-back");
      if (active && !reducedMotion) {
        void step.offsetWidth; // restart the animation
        step.classList.add(direction === "back" ? "is-entering-back" : "is-entering");
      }
    });

    railSteps.forEach((item) => {
      const k = Number(item.dataset.step);
      item.classList.toggle("is-current", k === n);
      item.classList.toggle("is-done", k < n);
      if (k === n) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });

    btnBack.hidden = n === 1;
    btnNext.textContent = n === TOTAL ? "Check my risk" : "Continue";
    updateSummary();

    if (focus) {
      const title = $(".step__title", steps[n - 1]);
      title.focus({ preventScroll: true });
      scrollSheetIntoView();
    }
  }

  btnBack.addEventListener("click", () => showStep(Math.max(1, current - 1), "back"));

  railSteps.forEach((item) => {
    item.addEventListener("click", () => {
      const target = Number(item.dataset.step);
      if (target < current) showStep(target, "back");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep(current)) return;
    if (current < TOTAL) {
      showStep(current + 1);
      return;
    }
    for (let n = 1; n < TOTAL; n++) {
      if (!validateStep(n)) {
        showStep(n, "back");
        validateStep(n);
        return;
      }
    }
    await submitAnswers();
  });

  /* ── Talking to the Flask API ────────────────────────────── */
  async function submitAnswers() {
    const answers = readAnswers();

    form.hidden = true;
    result.hidden = true;
    loading.hidden = false;
    formError.hidden = true;
    btnNext.disabled = true;
    scrollSheetIntoView();

    try {
      // Hold the loading state for a moment so the ECG trace can finish a sweep.
      const [response] = await Promise.all([
        fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(answers),
        }),
        wait(reducedMotion ? 0 : 1500),
      ]);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error("validation");
        error.fields = data.errors || null;
        throw error;
      }
      loading.hidden = true;
      renderResult(data, answers);
    } catch (error) {
      loading.hidden = true;
      form.hidden = false;
      if (error.fields) {
        let firstStep = TOTAL;
        Object.entries(error.fields).forEach(([name, message]) => {
          if (showError(name, message)) firstStep = Math.min(firstStep, STEP_OF[name]);
        });
        showStep(firstStep, "back");
        formError.textContent = "Some answers need another look. They are marked below.";
      } else {
        showStep(TOTAL, "back", { focus: false });
        formError.textContent = "We couldn't reach the server. Check your connection and try again.";
      }
      formError.hidden = false;
    } finally {
      btnNext.disabled = false;
    }
  }

  /* ── Result ──────────────────────────────────────────────── */
  const TITLES = { low: "Lower risk", borderline: "Borderline", high: "Higher risk" };

  const NEXT = {
    high: {
      title: "What to do next",
      html: "Book an appointment with a doctor and take these numbers with you. If you have chest pain, breathlessness, dizziness or fainting, get medical help promptly. In an emergency, call your local emergency number.",
    },
    borderline: {
      title: "What to do next",
      html: "This result isn't clear-cut. A doctor can look at your history and run tests this tool can't, so it's worth mentioning these numbers at your next check-up.",
    },
    low: {
      title: "What to do next",
      html: 'Most patients whose answers are like yours did not have heart disease. That does not rule it out, so keep up regular check-ups and the <a class="text-link" href="#habits">habits that help your heart</a>.',
    },
  };

  const HEART_PATH =
    "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z";

  const RANGE_TEXT = {
    Age: (lo, hi) => `Patients aged ${lo} to ${hi}`,
    RestingBP: (lo, hi) => `Blood pressure ${lo} to ${hi} mm Hg`,
    Cholesterol: (lo, hi) => `Cholesterol ${lo} to ${hi} mg/dL`,
    MaxHR: (lo, hi) => `Maximum heart rate ${lo} to ${hi} bpm`,
    Oldpeak: (lo, hi) => `ST depression ${lo} to ${hi} mm`,
  };

  function renderResult(data, answers) {
    const { neighbors_positive: yes, neighbors_total: total, level } = data;

    result.dataset.level = level;
    $("#result-title").textContent = TITLES[level];

    const lead = $("#result-lead");
    if (yes === 0) lead.innerHTML = `<strong>None</strong> of the ${total} patients whose answers are closest to yours had heart disease.`;
    else if (yes === total) lead.innerHTML = `<strong>All ${total}</strong> of the patients whose answers are closest to yours had heart disease.`;
    else lead.innerHTML = `<strong>${yes} of ${total}</strong> patients whose answers are closest to yours had heart disease.`;

    const dots = $("#dots");
    dots.setAttribute("aria-label", `${yes} of ${total} similar patients had heart disease`);
    dots.innerHTML = Array.from({ length: total }, (_, i) =>
      `<svg class="dot ${i < yes ? "dot--yes" : "dot--no"}" style="--i:${i}" viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`
    ).join("");

    const notes = [];
    if (answers.Cholesterol === null) notes.push("You skipped cholesterol, so the model used a typical value. The result may be less accurate.");
    if (data.outside_range && data.outside_range.length) {
      const names = data.outside_range.map((n) => LABEL[n].toLowerCase()).join(", ");
      notes.push(`Your ${names} ${data.outside_range.length > 1 ? "are" : "is"} outside the range the model learned from, so treat this result with extra care.`);
    }
    const note = $("#result-note");
    note.textContent = notes.join(" ");
    note.hidden = notes.length === 0;

    const next = NEXT[level];
    $("#result-next").innerHTML = `<h4>${next.title}</h4><p>${next.html}</p>`;

    const base = data.base_rate;
    $("#base-rate").textContent = `${Math.round(base * 100)}%`;
    $("#similar-list").innerHTML = data.similar_answers
      .map((item) => {
        const name = item.feature;
        const pct = Math.round(item.rate * 100);
        const tone = item.rate > base + 0.05 ? "is-up" : item.rate < base - 0.05 ? "is-down" : "";
        let group = "Patients who gave the same answer";
        if (RANGE_TEXT[name]) {
          const half = item.window;
          const fixed = name === "Oldpeak" ? 1 : 0;
          group = RANGE_TEXT[name]((answers[name] - half).toFixed(fixed), (answers[name] + half).toFixed(fixed));
        }
        return `<li class="${tone}">
          <div class="similar__row">
            <div class="similar__q">${LABEL[name]}: ${describe(name, answers)}<small>${group}</small></div>
            <div class="similar__pct">${pct}% <small>of ${item.n} had heart disease</small></div>
          </div>
          <div class="bar"><span class="bar__fill" style="--w:${pct}%"></span><span class="bar__tick" style="left:${(base * 100).toFixed(1)}%"></span></div>
        </li>`;
      })
      .join("");

    railSteps.forEach((item) => {
      item.classList.remove("is-current");
      item.classList.add("is-done");
      item.removeAttribute("aria-current");
    });
    visited = TOTAL;
    updateSummary();

    result.hidden = false;
    result.classList.remove("is-play");
    requestAnimationFrame(() => requestAnimationFrame(() => result.classList.add("is-play")));
    result.focus({ preventScroll: true });
    sheet.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function leaveResult() {
    result.hidden = true;
    result.classList.remove("is-play");
    form.hidden = false;
  }

  $("#btn-edit").addEventListener("click", () => {
    leaveResult();
    showStep(1, "back");
  });

  $("#btn-restart").addEventListener("click", () => {
    leaveResult();
    form.reset();
    $$(".range__slider").forEach((slider) => slider._paint());
    applyCholUnknown();
    $$(".field").forEach((field) => {
      field.classList.remove("has-error");
      $(".field__error", field).textContent = "";
    });
    formError.hidden = true;
    visited = 1;
    syncBeat();
    showStep(1, "back");
  });

  /* ── Start ───────────────────────────────────────────────── */
  applyCholUnknown();
  syncBeat();
  showStep(1, "forward", { focus: false });
})();
