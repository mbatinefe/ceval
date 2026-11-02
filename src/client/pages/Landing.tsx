import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Brand, BrandMark } from "../components/Brand";
import { useThemeColor } from "../lib/theme-color";
import "../styles/landing.css";

const STAGE = "#121211";
const SHELF = "#f3f3f0";

// How long the hero label holds each state, in milliseconds.
const SHELF_HOLD = 2000;
const LOCK_HOLD = 600;
const ANSWER_HOLD = 3600;
// Fields that change fade out for this long before the new values settle in.
const FADE_OUT = 200;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Answer = {
  id: string;
  tab: string;
  question: string;
  kicker: string;
  value: { kind: "price" | "range" | "text"; text: string };
  meta: string;
  was?: string;
  note: string;
  body: string;
};

const product = {
  aisle: "Aisle 14 · Audio",
  name: "Wireless headphones",
  meta: "Over-ear · Black",
  code: "0 49738 21904",
  shelf: "249.00",
};

const answers: Answer[] = [
  {
    id: "model",
    tab: "What is it?",
    question: "What is it, exactly?",
    kicker: "Exact model",
    value: { kind: "text", text: "Gen 2" },
    meta: "Over-ear · Black",
    note: "Matched by box and photo",
    body: "Ceval reads the box, the label or the product itself to find the exact model and variant. When two models look alike, it shows photos and asks which one you have.",
  },
  {
    id: "online",
    tab: "Cheaper online?",
    question: "Is it cheaper online?",
    kicker: "Online from",
    value: { kind: "price", text: "219.00" },
    meta: "Same model · New",
    was: "249.00",
    note: "$30 less at 3 stores",
    body: "Current offers for the same model at other stores, each with its condition and when it was checked. Item prices only, before shipping and tax.",
  },
  {
    id: "used",
    tab: "Worth used?",
    question: "What’s it worth used?",
    kicker: "Listed used",
    value: { kind: "range", text: "140–175" },
    meta: "Similar used listings",
    note: "Asking prices, not sales",
    body: "What similar used items are listed for on public marketplaces, for a flea-market find or something you want to sell. These are asking prices, not sales.",
  },
  {
    id: "later",
    tab: "Find it later?",
    question: "Can I find it later?",
    kicker: "In your finds",
    value: { kind: "text", text: "Saved" },
    meta: "Photo · Model · Prices",
    note: "Delete it any time",
    body: "Everything you scan is kept in Finds with its photo and prices, so you can compare later. Delete one or all of them at any time.",
  },
];

type Face = Pick<
  Answer,
  "question" | "kicker" | "value" | "meta" | "was" | "note"
>;

// Before Ceval reads the label, it shows what the store printed.
const shelfFace: Face = {
  question: product.aisle,
  kicker: "Shelf price",
  value: { kind: "price", text: product.shelf },
  meta: product.meta,
  note: "Point Ceval at the label",
};

const faceAt = (step: number): Face => (step >= 0 ? answers[step] : shelfFace);

// What each changing field shows. A field is redrawn only when this changes,
// so the product name, the barcode and any repeated line stay still.
const fieldsOf = (face: Face) => ({
  q: face.question,
  meta: face.was ? `Shelf ${face.was}` : face.meta,
  value: `${face.kicker} ${face.value.text}`,
  note: face.note,
});

type Field = keyof ReturnType<typeof fieldsOf>;
const FIELDS: Field[] = ["q", "meta", "value", "note"];

function Value({ value }: { value: Answer["value"] }) {
  if (value.kind === "text")
    return <span className="lp-val lp-val-text">{value.text}</span>;
  const [whole, cents] = value.text.split(".");
  return (
    <span className={`lp-val lp-val-${value.kind}`}>
      <span className="lp-val-cur">$</span>
      {whole}
      {cents ? <span className="lp-val-cents">{cents}</span> : null}
    </span>
  );
}

const bars = [
  2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1, 2, 2, 1, 3, 1, 1, 2, 1, 1,
  1, 3, 2, 1, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2,
];

function Barcode() {
  let x = 0;
  const rects = bars.map((width, index) => {
    const rect = index % 2 === 0 ? { x, width } : null;
    x += width;
    return rect;
  });
  return (
    <svg viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" aria-hidden="true">
      {rects.map((rect, index) =>
        rect ? (
          <rect key={index} x={rect.x} y="0" width={rect.width} height="20" />
        ) : null,
      )}
    </svg>
  );
}

// The hero: an electronic shelf label. A viewfinder locks on, and the label
// answers the four questions in turn.
function HeroShelf() {
  const [reduce] = useState(prefersReducedMotion);
  const [step, setStep] = useState(reduce ? 1 : -1);
  const [locked, setLocked] = useState(reduce);
  const [auto, setAuto] = useState(!reduce);
  const [inView, setInView] = useState(true);
  const [leaving, setLeaving] = useState<Field[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const finderRef = useRef<HTMLSpanElement>(null);
  const swapTimer = useRef(0);
  const aim = useRef(() => {});

  useEffect(() => () => window.clearTimeout(swapTimer.current), []);

  // Like a shelf label's partial refresh, only the fields that change are
  // redrawn: they fade out, then the new values settle in one by one.
  function swap(next: number) {
    const apply = () => {
      setLeaving([]);
      setStep(next);
      if (next === -1) setLocked(false);
    };
    window.clearTimeout(swapTimer.current);
    if (reduce) return apply();
    const from = fieldsOf(faceAt(step));
    const to = fieldsOf(faceAt(next));
    setLeaving(FIELDS.filter((field) => from[field] !== to[field]));
    swapTimer.current = window.setTimeout(apply, FADE_OUT);
  }

  function choose(index: number) {
    setAuto(false);
    setLocked(true);
    if (index !== step) swap(index);
  }

  const playing = auto && inView;
  useEffect(() => {
    if (!playing) return;
    const wait = step === -1 ? (locked ? LOCK_HOLD : SHELF_HOLD) : ANSWER_HOLD;
    const id = window.setTimeout(() => {
      if (step === -1 && !locked) return setLocked(true);
      swap(step === answers.length - 1 ? -1 : step + 1);
    }, wait);
    return () => window.clearTimeout(id);
  }, [playing, step, locked]);

  // Pause while the label is off screen or the tab is hidden.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let visible = true;
    const update = () => setInView(visible && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { threshold: 0.25 },
    );
    observer.observe(stage);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    aim.current = () => {
      if (auto && step === -1 && !locked) setLocked(true);
    };
  });

  // With a mouse, the pointer becomes a viewfinder over the shelf.
  useEffect(() => {
    const stage = stageRef.current;
    const label = labelRef.current;
    const finder = finderRef.current;
    if (!stage || !label || !finder || reduce) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    let x = 0,
      y = 0,
      tx = 0,
      ty = 0,
      frame = 0,
      shown = false;
    const tick = () => {
      x += (tx - x) * 0.3;
      y += (ty - y) * 0.3;
      finder.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame =
        Math.abs(tx - x) + Math.abs(ty - y) > 0.4
          ? requestAnimationFrame(tick)
          : 0;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      tx = event.clientX - 22;
      ty = event.clientY - 22;
      if (!shown) {
        x = tx;
        y = ty;
        shown = true;
      }
      const box = label.getBoundingClientRect();
      const over =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      stage.dataset.finder = over ? "label" : "on";
      if (over) aim.current();
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const leave = () => {
      stage.dataset.finder = "off";
      shown = false;
    };
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    return () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, [reduce]);

  const face = faceAt(step);
  const fields = fieldsOf(face);
  // A changed field gets a new key, so it is drawn fresh and settles in.
  const out = (name: Field) => leaving.includes(name);
  return (
    <>
      <div className="lp-stage" ref={stageRef} data-finder="off">
        <span className="lp-stage-rail" aria-hidden="true" />
        <div
          className={`lp-esl${step >= 0 ? " is-ceval" : ""}${locked ? " is-locked" : ""}`}
          ref={labelRef}
          aria-hidden="true"
          onClick={() => choose(step >= answers.length - 1 ? 0 : step + 1)}
        >
          <div className="lp-esl-screen lp-eink">
            <div className={`lp-esl-face lp-esl-${face.value.kind}`}>
              <span className="lp-esl-q" key={fields.q} data-out={out("q")}>
                {face.question}
              </span>
              <span className="lp-esl-brand">
                <BrandMark /> ceval
              </span>
              <span className="lp-esl-name">
                <strong>{product.name}</strong>
                {face.was ? (
                  <em
                    className="lp-esl-was"
                    key={fields.meta}
                    data-out={out("meta")}
                  >
                    Shelf <s>${face.was}</s>
                  </em>
                ) : (
                  <em key={fields.meta} data-out={out("meta")}>
                    {face.meta}
                  </em>
                )}
              </span>
              <span
                className="lp-esl-value"
                key={fields.value}
                data-out={out("value")}
              >
                <small>{face.kicker}</small>
                <Value value={face.value} />
              </span>
              <span className="lp-esl-code">
                <Barcode />
                <small>{product.code}</small>
              </span>
              <span
                className="lp-esl-note"
                key={fields.note}
                data-out={out("note")}
              >
                {face.note}
              </span>
            </div>
          </div>
          <span className="lp-esl-led" />
          <span className="lp-esl-lock">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <span className="lp-finder" ref={finderRef} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <div
        className="lp-tabs"
        role="group"
        aria-label="Questions Ceval answers"
        style={{ "--hold": `${ANSWER_HOLD}ms` } as CSSProperties}
      >
        {answers.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`lp-tab${index < step ? " is-done" : ""}`}
            aria-pressed={index === step}
            data-playing={playing && index === step}
            onClick={() => choose(index)}
          >
            <span className="lp-tab-bar">
              <i />
            </span>
            {item.tab}
          </button>
        ))}
      </div>
      <p className="lp-sr-only">
        Example: wireless headphones with a shelf price of $249. Ceval
        identifies the exact model, finds the same model online from $219, shows
        similar used listings asking $140 to $175, and saves the scan to your
        finds.
      </p>
    </>
  );
}

function MiniLabel({ answer }: { answer: Answer }) {
  return (
    <div className="lp-mini" aria-hidden="true">
      <div className="lp-mini-screen lp-eink">
        <span className="lp-mini-kicker">{answer.kicker}</span>
        <BrandMark className="lp-mini-mark" />
        <span className={`lp-mini-value lp-mini-${answer.value.kind}`}>
          <Value value={answer.value} />
        </span>
        <span className="lp-mini-meta">
          {answer.was ? (
            <>
              Shelf <s>${answer.was}</s>
            </>
          ) : (
            answer.meta
          )}
        </span>
      </div>
    </div>
  );
}

type BoardRow = {
  item: string;
  short: string;
  shelf: string;
  online: string;
  used: string;
  mark: "online" | "used" | "";
};

const boardRows: BoardRow[] = [
  {
    item: "Headphones",
    short: "Headphones",
    shelf: "249",
    online: "219",
    used: "140-175",
    mark: "online",
  },
  {
    item: "Coffee grinder",
    short: "Grinder",
    shelf: "189",
    online: "154",
    used: "90-120",
    mark: "online",
  },
  {
    item: "Desk lamp",
    short: "Desk lamp",
    shelf: "79",
    online: "79",
    used: "30-45",
    mark: "",
  },
  {
    item: "Film camera",
    short: "Camera",
    shelf: "45",
    online: "",
    used: "95-140",
    mark: "used",
  },
  {
    item: "Stand mixer",
    short: "Mixer",
    shelf: "449",
    online: "379",
    used: "220-300",
    mark: "online",
  },
  {
    item: "Robot vacuum",
    short: "Vacuum",
    shelf: "399",
    online: "329",
    used: "150-210",
    mark: "online",
  },
  {
    item: "Kettle",
    short: "Kettle",
    shelf: "59",
    online: "44",
    used: "20-30",
    mark: "online",
  },
  {
    item: "Speaker",
    short: "Speaker",
    shelf: "129",
    online: "99",
    used: "60-80",
    mark: "online",
  },
];

const VISIBLE_ROWS = 4;
const BOARD_QUERY = "(max-width: 819px)";
const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$-";

function boardText(row: BoardRow, narrow: boolean) {
  const widths = narrow ? [10, 3, 3, 7] : [14, 5, 5, 8];
  const money = (value: string) =>
    value ? (narrow ? value : `$${value}`) : "-";
  const values = [
    (narrow ? row.short : row.item).toUpperCase().padEnd(widths[0]),
    money(row.shelf).padStart(widths[1]),
    money(row.online).padStart(widths[2]),
    money(row.used).padStart(widths[3]),
  ];
  return values.map((value, index) => value.slice(0, widths[index]));
}

// A split-flap board. One row at a time flips to the next product.
function PriceBoard() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(BOARD_QUERY).matches,
  );
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia(BOARD_QUERY);
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || prefersReducedMotion()) return;
    const rows = [...board.querySelectorAll<HTMLElement>("[data-row]")];
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    // Each tile passes through one or two letters before it lands.
    const flip = (cell: HTMLElement, target: string, delay: number) => {
      let spins = 1 + Math.floor(Math.random() * 2);
      const turn = () => {
        cell.textContent =
          spins-- > 0
            ? glyphs[Math.floor(Math.random() * glyphs.length)]
            : target;
        cell.animate(
          [{ transform: "scaleY(0.2)" }, { transform: "scaleY(1)" }],
          { duration: 140, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
        );
        if (spins >= 0) later(turn, 130);
      };
      later(turn, delay);
    };
    const show = (rowElement: HTMLElement, row: BoardRow) => {
      rowElement.dataset.mark = row.mark;
      const groups = rowElement.querySelectorAll<HTMLElement>("[data-group]");
      boardText(row, narrow).forEach((text, group) => {
        groups[group]
          ?.querySelectorAll<HTMLElement>(".lp-flap")
          .forEach((cell, index) => {
            const target = text[index] ?? " ";
            if (cell.textContent !== target)
              flip(cell, target, index * 34 + group * 120);
          });
      });
    };
    let visible = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.3 },
    );
    observer.observe(board);
    let next = VISIBLE_ROWS;
    let row = 0;
    const interval = window.setInterval(() => {
      if (!visible || document.hidden) return;
      show(rows[row], boardRows[next % boardRows.length]);
      next += 1;
      row = (row + 1) % rows.length;
    }, 3400);
    return () => {
      window.clearInterval(interval);
      observer.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [narrow]);

  return (
    <>
      <div
        className="lp-board"
        ref={boardRef}
        key={String(narrow)}
        aria-hidden="true"
      >
        <div className="lp-board-head">
          <span>Item</span>
          <span>Shelf</span>
          <span>Online</span>
          <span>Used</span>
        </div>
        {boardRows.slice(0, VISIBLE_ROWS).map((row) => (
          <div
            className="lp-board-row"
            data-row
            data-mark={row.mark}
            key={row.item}
          >
            {boardText(row, narrow).map((text, group) => (
              <span className="lp-board-group" data-group={group} key={group}>
                {[...text].map((char, index) => (
                  <span className="lp-flap" key={index}>
                    {char}
                  </span>
                ))}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="lp-sr-only">
        <table>
          <caption>Example prices in US dollars</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Shelf</th>
              <th scope="col">Online, same model</th>
              <th scope="col">Used, asking</th>
            </tr>
          </thead>
          <tbody>
            {boardRows.map((row) => (
              <tr key={row.item}>
                <th scope="row">{row.item}</th>
                <td>${row.shelf}</td>
                <td>{row.online ? `$${row.online}` : "No new offers"}</td>
                <td>${row.used.replace("-", " to $")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Camera glasses, drawn: the Ceval mark in one lens, an answer in the other.
function Glasses() {
  return (
    <svg className="lp-glasses" viewBox="0 0 420 170" aria-hidden="true">
      <path
        className="lp-glasses-line"
        d="M10 50h26M384 50h26M183 62c10-13 44-13 54 0"
      />
      <rect
        className="lp-glasses-line"
        x="36"
        y="26"
        width="147"
        height="112"
        rx="40"
      />
      <rect
        className="lp-glasses-line"
        x="237"
        y="26"
        width="147"
        height="112"
        rx="40"
      />
      <circle className="lp-glasses-cam" cx="56" cy="44" r="5.5" />
      <g transform="translate(77.5 50)">
        <path fill="#131313" d="M2 28V2h26v9H11v17zM62 36v26H36v-9h17V36z" />
        <rect x="21" y="21" width="22" height="22" fill="#c4161c" />
      </g>
      <text className="lp-glasses-hud" x="310.5" y="70" textAnchor="middle">
        ONLINE FROM
      </text>
      <text className="lp-glasses-price" x="310.5" y="112" textAnchor="middle">
        $219
      </text>
    </svg>
  );
}

const questions: [string, string][] = [
  [
    "Where does Ceval work?",
    "In your phone’s browser, in Safari or Chrome. There’s no app to install.",
  ],
  [
    "What does it read best?",
    "Electronics and boxed products with a visible model name or number.",
  ],
  [
    "Which markets does it cover?",
    "The United States, the United Kingdom and Türkiye, in local currency.",
  ],
  [
    "Can I use a video instead?",
    "Yes. Scan live, or choose a video up to 10 minutes long.",
  ],
  [
    "When does it use the camera?",
    "Only after you tap to start. You can stop at any time.",
  ],
  [
    "What leaves my phone?",
    "Selected frames, sent to Meta’s Muse Spark model to recognize products and search prices. Your full video stays on your device.",
  ],
  [
    "What does Ceval save?",
    "Your recent finds and small product photos, in your account. Delete one or all of them at any time.",
  ],
  [
    "Are these sold prices?",
    "No. Store prices are current offers, and marketplace prices are what sellers are asking, not completed sales.",
  ],
];

export function Landing() {
  const heroRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [header, setHeader] = useState({ dark: true, scrolled: false });

  // The header turns dark over the dark top and bottom of the page.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = 64;
      const hero = heroRef.current?.getBoundingClientRect();
      const end = endRef.current?.getBoundingClientRect();
      const dark =
        (hero ? hero.bottom > line : false) || (end ? end.top < line : false);
      const scrolled = window.scrollY > 8;
      setHeader((current) =>
        current.dark === dark && current.scrolled === scrolled
          ? current
          : { dark, scrolled },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  useThemeColor(header.dark ? STAGE : SHELF);

  return (
    <div className="lp lp-home">
      <a className="lp-skip" href="#lp-main">
        Skip to content
      </a>
      <header
        className="lp-top"
        data-theme={header.dark ? "dark" : "light"}
        data-scrolled={header.scrolled}
      >
        <div className="lp-wrap lp-top-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a className="lp-top-link lp-top-optional" href="#how">
              How it works
            </a>
            <a className="lp-top-link lp-top-optional" href="#fine-print">
              Fine print
            </a>
            <a className="lp-top-link" href="/signin">
              Sign in
            </a>
            <a className="lp-btn lp-btn-sm lp-top-cta" href="/app">
              Open Ceval
            </a>
          </nav>
        </div>
      </header>
      <main id="lp-main">
        <section
          className="lp-hero lp-dark"
          ref={heroRef}
          aria-labelledby="lp-title"
        >
          <h1 id="lp-title">Know what it’s worth.</h1>
          <HeroShelf />
          <p className="lp-hero-lede">
            Point your phone at a product. Ceval names the exact model, finds it
            at other stores and secondhand, and links every price to its source.
          </p>
          <div className="lp-hero-actions">
            <a className="lp-btn lp-btn-light" href="/app">
              Open Ceval
            </a>
            <span>Works in your phone’s browser</span>
          </div>
          <p className="lp-hero-note">Example product and prices</p>
        </section>

        <section className="lp-ans" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <h2 id="how-title">One scan, four answers.</h2>
              <p>
                On a store shelf, at a flea market or at home before you sell.
                Ceval works out what you’re looking at before it checks a single
                price.
              </p>
            </div>
            <div className="lp-bays">
              {answers.map((answer) => (
                <article className="lp-bay" key={answer.id}>
                  <div className="lp-bay-shelf">
                    <span className="lp-bay-rail" aria-hidden="true" />
                    <MiniLabel answer={answer} />
                  </div>
                  <h3>{answer.question}</h3>
                  <p>{answer.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-bsec" aria-labelledby="board-title">
          <div className="lp-wrap">
            <div className="lp-head lp-head-center">
              <h2 id="board-title">Shelf, online and used, side by side.</h2>
              <p>
                Every price links to the page it came from, with the store and
                when it was checked. If Ceval can’t verify a price, it says so.
              </p>
            </div>
            <PriceBoard />
            <p className="lp-board-note">
              <b>Online:</b> current offers for the same model. <b>Used:</b>{" "}
              what sellers are asking, not sales. Example prices in US dollars.
            </p>
          </div>
        </section>

        <section className="lp-next" aria-labelledby="next-title">
          <div className="lp-wrap lp-next-grid">
            <Glasses />
            <div className="lp-next-copy">
              <p className="lp-next-status">Concept · Not available yet</p>
              <h2 id="next-title">Next: camera glasses.</h2>
              <p>
                We’re exploring Ceval on camera glasses, so you can check what
                something is worth without taking out your phone.
              </p>
            </div>
          </div>
        </section>

        <section
          className="lp-faq"
          id="fine-print"
          aria-labelledby="fine-print-title"
        >
          <div className="lp-wrap lp-faq-grid">
            <h2 id="fine-print-title">The fine print</h2>
            <dl className="lp-faq-list">
              {questions.map(([question, answer]) => (
                <div key={question}>
                  <dt>{question}</dt>
                  <dd>{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <div className="lp-end lp-dark" ref={endRef}>
        <section className="lp-wrap lp-end-inner" aria-labelledby="end-title">
          <div className="lp-end-copy">
            <h2 id="end-title">Try it on the next price tag you see.</h2>
            <div className="lp-end-actions">
              <a className="lp-btn lp-btn-light" href="/app">
                Open Ceval
              </a>
              <span>Sign in with an email code.</span>
            </div>
          </div>
          <figure className="lp-end-qr">
            <img
              src="/campaign/open-app-qr.svg"
              width="132"
              height="132"
              loading="lazy"
              alt="QR code that opens Ceval"
            />
            <figcaption>On a computer? Scan this with your phone.</figcaption>
          </figure>
        </section>
        <footer className="lp-footer">
          <div className="lp-wrap lp-footer-inner">
            <Brand />
            <nav aria-label="Footer navigation">
              <a href="#how">How it works</a>
              <a href="#fine-print">Fine print</a>
              <a href="/signin">Sign in</a>
              <a href="/app">Open Ceval</a>
            </nav>
            <p>
              The products and prices on this page are examples, not live
              offers.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
