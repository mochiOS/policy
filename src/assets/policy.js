let POLICY_MANIFEST = null;
let POLICY_DOCS = [];

function normalizePath(pathname) {
    if (!pathname.endsWith("/")) {
        pathname += "/";
    }

    return pathname;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
    }

    return await response.json();
}

async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
    }

    return await response.text();
}

function renderInline(value) {
    let text = escapeHtml(value);

    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
    text = text.replace(/\[([^\]]+)]\((\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

    return text;
}

function renderMarkdown(markdown) {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let list = null;
    let code = null;

    function flushParagraph() {
        if (paragraph.length === 0) {
            return;
        }

        html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
        paragraph = [];
    }

    function flushList() {
        if (!list) {
            return;
        }

        html.push(`<${list.type}>${list.items.map(item => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`);
        list = null;
    }

    function flushCode() {
        if (!code) {
            return;
        }

        html.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
        code = null;
    }

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();

        if (line.startsWith("```")) {
            if (code) {
                flushCode();
            } else {
                flushParagraph();
                flushList();
                code = { lines: [] };
            }
            continue;
        }

        if (code) {
            code.lines.push(rawLine);
            continue;
        }

        if (line.trim() === "") {
            flushParagraph();
            flushList();
            continue;
        }

        if (/^---+$/.test(line.trim())) {
            flushParagraph();
            flushList();
            html.push("<hr>");
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            flushList();
            const level = heading[1].length;
            html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            continue;
        }

        const unordered = line.match(/^\s*[-*]\s+(.+)$/);
        if (unordered) {
            flushParagraph();
            if (!list || list.type !== "ul") {
                flushList();
                list = { type: "ul", items: [] };
            }
            list.items.push(unordered[1]);
            continue;
        }

        const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
        if (ordered) {
            flushParagraph();
            if (!list || list.type !== "ol") {
                flushList();
                list = { type: "ol", items: [] };
            }
            list.items.push(ordered[1]);
            continue;
        }

        const quote = line.match(/^>\s+(.+)$/);
        if (quote) {
            flushParagraph();
            flushList();
            html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
            continue;
        }

        paragraph.push(line.trim());
    }

    flushCode();
    flushParagraph();
    flushList();

    return html.join("\n");
}

function parseMarkdownDocument(markdown) {
    const normalized = markdown.replace(/\r\n/g, "\n");

    if (!normalized.startsWith("---\n")) {
        return {
            meta: {},
            body: markdown
        };
    }

    const lines = normalized.split("\n");
    const endIndex = lines.findIndex((line, index) => {
        return index > 0 && line.trim() === "---";
    });

    if (endIndex === -1) {
        return {
            meta: {},
            body: markdown
        };
    }

    const meta = {};

    for (const line of lines.slice(1, endIndex)) {
        const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);

        if (!match) {
            continue;
        }

        const key = match[1];
        meta[key] = match[2].trim().replace(/^["']|["']$/g, "");
    }

    return {
        meta,
        body: lines.slice(endIndex + 1).join("\n").replace(/^\n+/, "")
    };
}

function flattenDocs(manifest) {
    return manifest.sections.flatMap(section => {
        return section.items.map(item => {
            return {
                ...item,
                path: normalizePath(item.path),
                section: section.label
            };
        });
    });
}

function findDocument(pathname) {
    const path = normalizePath(pathname);
    return POLICY_DOCS.find(doc => doc.path === path) || POLICY_DOCS.find(doc => doc.path === "/");
}

function renderSidebar() {
    const sidebar = document.querySelector("[data-policy-sidebar]");

    sidebar.innerHTML = POLICY_MANIFEST.sections.map(section => {
        const links = section.items.map(item => {
            const path = normalizePath(item.path);
            const title = item.navTitle || item.title;

            return `<a class="sb-link" href="${escapeHtml(path)}" data-policy-link>${escapeHtml(title)}</a>`;
        }).join("");

        return `<div class="sb-section"><div class="sb-label">${escapeHtml(section.label)}</div>${links}</div>`;
    }).join("");
}

function setActiveNav(pathname) {
    const path = normalizePath(pathname);

    document.querySelectorAll("[data-policy-link]").forEach(link => {
        const href = normalizePath(new URL(link.href).pathname);
        link.classList.toggle("active", href === path);
    });
}

function setText(selector, value) {
    const element = document.querySelector(selector);

    if (element) {
        element.textContent = value || "";
    }
}

async function loadDocument(pathname = location.pathname) {
    const path = normalizePath(pathname);
    const doc = findDocument(path);
    const container = document.querySelector("[data-policy-content]");

    document.title = `${doc.title} - ${POLICY_MANIFEST.site.title}`;
    setText("[data-policy-eyebrow]", doc.eyebrow || "Policy");
    setText("[data-policy-title]", doc.title);
    setText("[data-policy-subtitle]", doc.subtitle || "");
    setText("[data-policy-category]", doc.category || doc.section || "Policy");
    setText("[data-policy-updated]", "最終更新: 読み込み中");
    setActiveNav(path);

    container.innerHTML = '<div class="policy-loading">文書を読み込んでいます。</div>';

    try {
        const markdown = await fetchText(doc.markdown);
        const parsed = parseMarkdownDocument(markdown);
        const update = parsed.meta.update || doc.update;

        if (update) {
            setText("[data-policy-updated]", `最終更新: ${update}`);
        } else {
            setText("[data-policy-updated]", "最終更新: 未記載");
        }

        container.innerHTML = `<article class="doc-card markdown">${renderMarkdown(parsed.body)}</article>`;
    } catch (error) {
        setText("[data-policy-updated]", "最終更新: 取得不可");
        container.innerHTML = `<div class="policy-error">文書を読み込めませんでした。<br><code>${escapeHtml(error.message)}</code></div>`;
    }
}

function enableClientNavigation() {
    document.addEventListener("click", event => {
        const link = event.target.closest("a[href]");

        if (!link) {
            return;
        }

        const url = new URL(link.href);

        if (url.origin !== location.origin) {
            return;
        }

        if (!POLICY_DOCS.some(doc => doc.path === normalizePath(url.pathname))) {
            return;
        }

        event.preventDefault();
        history.pushState({}, "", url.pathname);
        loadDocument(url.pathname);
    });

    window.addEventListener("popstate", () => {
        loadDocument(location.pathname);
    });
}

async function main() {
    POLICY_MANIFEST = await fetchJson("/content/index.json");
    POLICY_DOCS = flattenDocs(POLICY_MANIFEST);
    renderSidebar();
    enableClientNavigation();
    await loadDocument();
}

main().catch(error => {
    const container = document.querySelector("[data-policy-content]");

    if (container) {
        container.innerHTML = `<div class="policy-error">文書一覧を読み込めませんでした。<br><code>${escapeHtml(error.message)}</code></div>`;
    }
});
