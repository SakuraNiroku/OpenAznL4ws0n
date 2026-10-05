/* Entirely local: file data is loaded by manifest.js, never fetched. */
"use strict";
(() => {
  const data = window.ARCHIVE_DATA;
  const $ = (id) => document.getElementById(id);
  const files = data.files;
  const state = { folder: "", query: "", filter: "all", view: "grid" };
  const mobile = window.matchMedia("(max-width: 640px)");
  const directories = new Set(data.directories);
  const descendantCounts = new Map(data.directories.map((path) => [path, 0]));
  for (const file of files) {
    let parent = file.parent;
    while (parent) {
      descendantCounts.set(parent, (descendantCounts.get(parent) || 0) + 1);
      parent = parent.includes("/") ? parent.slice(0, parent.lastIndexOf("/")) : "";
    }
  }
  const folderName = (path) => path.split("/").at(-1);
  const parentPath = (path) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const sortByName = (a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true });
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(kind) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "17");
    svg.setAttribute("height", "17");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    const paths = {
      folder: "M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z",
      file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8M8 16h6",
      home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
    };
    path.setAttribute("d", paths[kind] || paths.file);
    svg.append(path);
    return svg;
  }
  function size(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  function folderHref(path) { return path ? `#folder=${encodeURIComponent(path)}` : "#"; }
  function makeTree(parent, container) {
    const children = data.directories.filter((path) => parentPath(path) === parent)
      .sort((a, b) => folderName(a).localeCompare(folderName(b), "zh-CN", { numeric: true }));
    for (const path of children) {
      const row = element("div", "tree-row");
      row.dataset.path = path;
      const link = element("a", "tree-link");
      link.href = folderHref(path);
      link.append(icon("folder"), element("span", "tree-name", folderName(path)), element("span", "tree-count", descendantCounts.get(path)));
      row.append(link);
      container.append(row);
      if (data.directories.some((child) => parentPath(child) === path)) {
        const nested = element("div", "tree-children");
        nested.hidden = true;
        const toggle = element("button", "tree-toggle", "›");
        toggle.setAttribute("aria-label", `展开 ${path}`);
        toggle.setAttribute("aria-expanded", "false");
        const toggleChildren = (open) => {
          nested.hidden = !open;
          toggle.textContent = open ? "⌄" : "›";
          toggle.setAttribute("aria-expanded", String(open));
          toggle.setAttribute("aria-label", `${open ? "收起" : "展开"} ${path}`);
        };
        toggle.addEventListener("click", () => toggleChildren(nested.hidden));
        row.append(toggle);
        container.append(nested);
        makeTree(path, nested);
        row.openChildren = () => toggleChildren(true);
      }
    }
  }
  const homeRow = element("div", "tree-row active");
  homeRow.dataset.path = "";
  const homeLink = element("a", "tree-link");
  homeLink.href = "#";
  homeLink.append(icon("home"), element("span", "tree-name", "全部馆藏"), element("span", "tree-count", files.length));
  homeRow.append(homeLink);
  $("tree").append(homeRow);
  makeTree("", $("tree"));
  $("archive-title").textContent = data.title;
  $("footer-title").textContent = data.title;
  $("file-count").textContent = files.length;
  $("image-count").textContent = files.filter((file) => file.kind === "image").length;
  $("folder-count").textContent = data.directories.length;
  $("directory-count").textContent = String(data.directories.length).padStart(2, "0");
  $("total-size").textContent = size(data.totalBytes);

  const flowerKey = "aznL4ws0n:flowers:v1";
  let flowers = 0;
  try {
    const saved = Number(localStorage.getItem(flowerKey));
    if (Number.isSafeInteger(saved) && saved >= 0) flowers = saved;
  } catch { /* Remember flowers for this visit when storage is unavailable. */ }
  function renderFlowers() {
    $("flower-status").textContent = flowers
      ? `你已献上 ${flowers.toLocaleString("zh-CN")} 束花，愿记忆长存。`
      : "献上一束花，寄托思念。";
  }
  renderFlowers();
  $("offer-flower").addEventListener("click", () => {
    flowers = Math.min(flowers + 1, Number.MAX_SAFE_INTEGER);
    try { localStorage.setItem(flowerKey, String(flowers)); }
    catch { /* The button still works without persistent storage. */ }
    renderFlowers();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const flower = element("span", "flower-particle", "✿");
      flower.setAttribute("aria-hidden", "true");
      flower.style.left = `${25 + (flowers % 5) * 12}%`;
      $("memorial-image-wrap").append(flower);
      setTimeout(() => flower.remove(), 1300);
    }
  });

  function renderBreadcrumbs() {
    const container = $("breadcrumbs");
    container.replaceChildren();
    const home = element("a", "", "全部馆藏");
    home.href = "#";
    container.append(home);
    let path = "";
    for (const part of state.folder.split("/").filter(Boolean)) {
      path += (path ? "/" : "") + part;
      container.append(element("span", "", "/"));
      if (path === state.folder) container.append(element("span", "", part));
      else {
        const link = element("a", "", part);
        link.href = folderHref(path);
        container.append(link);
      }
    }
    if (state.query) container.append(element("span", "", "/"), element("span", "", "全站搜索"));
  }

  function entryCard(entry) {
    const isFolder = entry.kind === "folder";
    const card = element(isFolder ? "a" : "button", "entry");
    card.dataset.path = entry.path;
    if (isFolder) card.href = folderHref(entry.path);
    else {
      card.type = "button";
      card.addEventListener("click", () => showPreview(entry));
    }
    const preview = element("div", `entry-preview ${entry.kind}`);
    if (entry.kind === "image") {
      const img = element("img");
      img.src = entry.url;
      img.alt = entry.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => { img.replaceWith(icon("file")); }, { once: true });
      preview.append(img);
    } else if (entry.kind === "text") {
      preview.append(element("p", "text-sample", entry.text.slice(0, 500) || "（空文件）"));
    } else preview.append(icon(isFolder ? "folder" : "file"));
    const labels = { folder: "FOLDER", image: "IMAGE", text: "TEXT", file: "FILE" };
    preview.append(element("span", "entry-type", labels[entry.kind]));
    const info = element("div", "entry-info");
    const name = element("span", "entry-name", entry.name);
    name.title = entry.name;
    const meta = element("div", "entry-meta");
    meta.append(element("span", "entry-location", entry.parent || "根目录"));
    const details = element("span", "entry-size", isFolder ? `${descendantCounts.get(entry.path)} 个文件` : size(entry.size));
    details.append(element("span", "entry-arrow", "↗"));
    meta.append(details);
    info.append(name, meta);
    card.append(preview, info);
    return card;
  }
  function render() {
    renderBreadcrumbs();
    const query = state.query.toLocaleLowerCase();
    const matching = files.filter((file) => {
      const inFolder = !state.folder || file.path.startsWith(state.folder + "/");
      const textMatch = !query || `${file.path}\n${file.text || ""}`.toLocaleLowerCase().includes(query);
      return (query || inFolder) && textMatch && (state.filter === "all" || file.kind === state.filter);
    });
    // The overview includes every file. Inside a directory, show direct children;
    // filtered and searched views include descendants so matches stay reachable.
    const visibleFiles = state.folder && !query && state.filter === "all"
      ? matching.filter((file) => file.parent === state.folder) : matching;
    const visibleFolders = state.folder && !query && state.filter === "all"
      ? data.directories.filter((path) => parentPath(path) === state.folder)
        .map((path) => ({ path, parent: parentPath(path), name: folderName(path), kind: "folder" })) : [];
    const entries = [...visibleFolders.sort(sortByName), ...visibleFiles.sort(sortByName)];
    $("entries").className = `entries ${state.view === "list" ? "list" : ""}`;
    $("entries").replaceChildren(...entries.map(entryCard));
    $("empty").hidden = entries.length !== 0;
    $("hero").hidden = Boolean(state.folder || query);
    $("collection-title").textContent = query ? "搜索结果" : state.folder ? folderName(state.folder) : "全部馆藏";
    $("result-count").textContent = `${visibleFiles.length} 个文件${visibleFolders.length ? ` · ${visibleFolders.length} 个目录` : ""}${query ? ` · “${state.query}”` : ""}`;
    document.querySelectorAll(".tree-row").forEach((row) => {
      const active = !query && row.dataset.path === state.folder;
      row.classList.toggle("active", active);
      const link = row.querySelector("a");
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
      if (state.folder.startsWith(row.dataset.path + "/") && row.openChildren) row.openChildren();
    });
  }
  function setSidebar(open) {
    $("sidebar").classList.toggle("open", open);
    $("sidebar").inert = mobile.matches && !open;
    $("menu-toggle").setAttribute("aria-expanded", String(open));
    $("menu-toggle").setAttribute("aria-label", open ? "关闭目录" : "打开目录");
  }
  function readHash() {
    let folder = "";
    try { if (location.hash.startsWith("#folder=")) folder = decodeURIComponent(location.hash.slice(8)); }
    catch { /* A malformed fragment simply shows the overview. */ }
    if (folder && !directories.has(folder)) folder = "";
    state.folder = folder;
    state.query = "";
    $("search").value = "";
    setSidebar(false);
    render();
  }
  window.addEventListener("hashchange", readHash);
  $("tree").addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      state.query = "";
      $("search").value = "";
      setSidebar(false);
      render();
    }
  });
  let searchTimer;
  $("search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = $("search").value.trim(); render(); }, 120);
  });
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    render();
  }));
  ["grid", "list"].forEach((view) => $(`${view}-view`).addEventListener("click", () => {
    state.view = view;
    ["grid", "list"].forEach((item) => {
      $(`${item}-view`).classList.toggle("selected", item === view);
      $(`${item}-view`).setAttribute("aria-pressed", String(item === view));
    });
    render();
  }));
  $("reset").addEventListener("click", () => {
    state.folder = ""; state.query = ""; state.filter = "all";
    $("search").value = "";
    document.querySelector('[data-filter="all"]').click();
    location.hash = "";
  });
  $("menu-toggle").addEventListener("click", () => setSidebar(!$("sidebar").classList.contains("open")));
  $("sidebar-close").addEventListener("click", () => { setSidebar(false); $("menu-toggle").focus(); });
  mobile.addEventListener("change", () => setSidebar(false));
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#sidebar, #menu-toggle")) setSidebar(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !$("preview").open && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      event.preventDefault(); $("search").focus();
    }
    if (event.key === "Escape") setSidebar(false);
  });

  // Render a small, safe Markdown subset using DOM nodes. Repository content is
  // never interpreted as HTML, including .html files and embedded Markdown HTML.
  function inlineMarkdown(value, container) {
    const tokens = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g;
    let previous = 0;
    for (const match of value.matchAll(tokens)) {
      container.append(document.createTextNode(value.slice(previous, match.index)));
      const token = match[0];
      if (token.startsWith("`")) container.append(element("code", "", token.slice(1, -1)));
      else if (token.startsWith("**")) container.append(element("strong", "", token.slice(2, -2)));
      else {
        const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
        const [, label, href] = parts;
        if (/^https?:\/\//i.test(href)) {
          const link = element("a", "", label);
          link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
          container.append(link);
        } else container.append(document.createTextNode(label));
      }
      previous = match.index + token.length;
    }
    container.append(document.createTextNode(value.slice(previous)));
  }
  function markdown(text) {
    const article = element("article", "markdown");
    let code = null, paragraph = [], list = null;
    const flush = () => {
      if (paragraph.length) {
        const p = element("p"); inlineMarkdown(paragraph.join("\n"), p); article.append(p); paragraph = [];
      }
      list = null;
    };
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*```/.test(line)) {
        flush();
        if (code) code = null;
        else { code = element("pre"); article.append(code); }
      } else if (code) code.append(document.createTextNode(line + "\n"));
      else if (/^#{1,6}\s/.test(line)) {
        flush(); const match = /^(#{1,6})\s+(.*)$/.exec(line);
        const heading = element(`h${match[1].length}`); inlineMarkdown(match[2], heading); article.append(heading);
      } else if (/^\s*[-*]\s+/.test(line)) {
        if (paragraph.length) flush();
        if (!list) { list = element("ul"); article.append(list); }
        const item = element("li"); inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""), item); list.append(item);
      } else if (/^>\s?/.test(line)) {
        flush(); const quote = element("blockquote"); inlineMarkdown(line.replace(/^>\s?/, ""), quote); article.append(quote);
      } else if (!line.trim()) flush();
      else { list = null; paragraph.push(line); }
    }
    flush(); return article;
  }
  function showPreview(file) {
    $("preview-name").textContent = file.name;
    $("preview-path").textContent = file.parent || "根目录";
    $("preview-details").textContent = `${size(file.size)} · ${file.path}`;
    $("download").href = file.url;
    if (location.protocol === "file:") {
      $("download").removeAttribute("download");
      $("download").target = "_blank";
      $("download").rel = "noopener noreferrer";
      $("download").textContent = "查看原文件 ↗";
    } else {
      $("download").download = file.name;
      $("download").textContent = "下载原文件 ↓";
    }
    const content = $("preview-content");
    content.replaceChildren(); content.scrollTop = 0;
    if (file.kind === "image") {
      const image = element("img"); image.src = file.url; image.alt = file.name;
      image.addEventListener("error", () => { image.replaceWith(element("p", "binary-message", "这张图片无法在浏览器中预览，可以通过下方入口查看原文件。")); }, { once: true });
      content.append(image);
    } else if (file.kind === "text") content.append(/\.md$/i.test(file.name) ? markdown(file.text) : element("pre", "", file.text || "（空文件）"));
    else if (/\.(mp4|webm|ogg|mp3|wav|m4a|flac)$/i.test(file.name)) {
      const media = element(/\.(mp4|webm)$/i.test(file.name) ? "video" : "audio");
      media.controls = true; media.preload = "metadata"; media.src = file.url;
      media.addEventListener("error", () => { media.replaceWith(element("p", "binary-message", "浏览器不支持这个媒体格式，请通过下方入口查看原文件。")); }, { once: true });
      content.append(media);
    } else content.append(element("p", "binary-message", "这个文件暂不支持在线预览，或超过文字预览大小限制。\n通过下方原文件入口查看完整内容。"));
    $("preview").showModal();
  }
  $("close-preview").addEventListener("click", () => $("preview").close());
  $("preview").addEventListener("click", (event) => {
    if (event.target !== $("preview")) return;
    const bounds = $("preview").getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $("preview").close();
  });
  $("preview").addEventListener("close", () => {
    $("preview-content").querySelectorAll("video,audio").forEach((media) => media.pause());
  });
  readHash();
})();
