// 분류·업무 필터와 검색으로 ITEMS(data.js)를 보여줍니다.
const CATS = [
  { id: "all", label: "전체" },
  { id: "summary", label: "요약" },
  { id: "howto", label: "업무 방법" },
  { id: "claim", label: "청구" },
  { id: "term", label: "용어" },
  { id: "system", label: "시스템·사이트" },
  { id: "law", label: "법령·매뉴얼" },
];

const TYPES = [
  { id: "all", label: "전체" },
  { id: "home", label: "방문요양" },
  { id: "day", label: "주·야간보호" },
  { id: "facility", label: "요양원" },
  { id: "common", label: "공통" },
];

const state = { cat: "all", type: "all", query: "" };

const listEl = document.getElementById("list");
const countEl = document.getElementById("result-count");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function labelOf(list, id) {
  return list.find((x) => x.id === id).label;
}

function itemText(item) {
  const parts = [item.title, ...(item.body || []), item.check || ""];
  if (item.table) parts.push(...item.table.head, ...item.table.rows.flat());
  return parts.join(" ").toLowerCase();
}

function matches(item) {
  if (state.cat !== "all" && item.cat !== state.cat) return false;
  // 공통 항목은 어느 업무를 골라도 함께 보여줍니다.
  if (state.type !== "all" && !item.types.includes(state.type) && !item.types.includes("common")) return false;
  if (state.query && !itemText(item).includes(state.query)) return false;
  return true;
}

function renderBody(lines) {
  const frag = document.createDocumentFragment();
  let list = null;
  for (const line of lines) {
    const numbered = /^\d+\.\s/.test(line);
    if (numbered) {
      if (!list || list.tagName !== "OL") {
        list = el("ol");
        frag.appendChild(list);
      }
      list.appendChild(el("li", null, line.replace(/^\d+\.\s/, "")));
    } else if (lines.length > 1) {
      if (!list || list.tagName !== "UL") {
        list = el("ul");
        frag.appendChild(list);
      }
      list.appendChild(el("li", null, line));
    } else {
      frag.appendChild(el("p", null, line));
    }
  }
  return frag;
}

function renderTable(table) {
  const wrap = el("div", "table-wrap");
  const t = el("table");
  const thead = el("thead");
  const hr = el("tr");
  table.head.forEach((h) => hr.appendChild(el("th", null, h)));
  thead.appendChild(hr);
  const tbody = el("tbody");
  table.rows.forEach((row) => {
    const tr = el("tr");
    row.forEach((c) => tr.appendChild(el("td", null, c)));
    tbody.appendChild(tr);
  });
  t.append(thead, tbody);
  wrap.appendChild(t);
  return wrap;
}

function renderItem(item) {
  const card = el("details", "card");
  if (state.query) card.open = true;

  const summary = el("summary");
  const tags = el("span", "tags");
  tags.appendChild(el("span", "tag tag-cat", labelOf(CATS, item.cat)));
  item.types.forEach((t) => tags.appendChild(el("span", "tag tag-" + t, labelOf(TYPES, t))));
  summary.append(tags, el("span", "card-title", item.title));
  card.appendChild(summary);

  const body = el("div", "card-body");
  if (item.body) body.appendChild(renderBody(item.body));
  if (item.table) body.appendChild(renderTable(item.table));
  if (item.check) body.appendChild(el("p", "check", "확인 필요: " + item.check));
  if (item.source) {
    const src = el("p", "source");
    src.appendChild(document.createTextNode("출처: "));
    item.source.forEach((s, i) => {
      if (i) src.appendChild(document.createTextNode(", "));
      const a = el("a", null, s.name);
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      src.appendChild(a);
    });
    body.appendChild(src);
  }
  card.appendChild(body);
  return card;
}

function render() {
  const items = ITEMS.filter(matches);
  listEl.replaceChildren(...items.map(renderItem));
  countEl.textContent = items.length ? `${items.length}개 항목` : "찾는 내용이 없습니다. 검색어나 분류를 바꿔 보세요.";
}

function buildButtons(container, list, key) {
  list.forEach((opt) => {
    const btn = el("button", null, opt.label);
    btn.type = "button";
    btn.dataset.id = opt.id;
    btn.setAttribute("aria-pressed", String(state[key] === opt.id));
    btn.addEventListener("click", () => {
      state[key] = opt.id;
      container.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === opt.id)));
      render();
    });
    container.appendChild(btn);
  });
}

buildButtons(document.getElementById("cat-tabs"), CATS, "cat");
buildButtons(document.getElementById("type-filters"), TYPES, "type");

document.getElementById("search").addEventListener("input", (e) => {
  state.query = e.target.value.trim().toLowerCase();
  render();
});

document.getElementById("updated").textContent = UPDATED;
render();
