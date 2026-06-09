const DOCS = {
    "/": {
        title: "mochiOS Policy",
        eyebrow: "Legal Center",
        subtitle: "mochiOS関連サービスの規約、プライバシーポリシー、開発者向けルールをまとめています。",
        markdown: "/content/index.md"
    },
    "/privacy/": {
        title: "プライバシーポリシー",
        eyebrow: "Privacy",
        subtitle: "mochiOS関連サービスにおける情報の取得、利用、保存、問い合わせ方法について説明します。",
        markdown: "/content/privacy.md"
    },
    "/terms/": {
        title: "利用規約",
        eyebrow: "Terms",
        subtitle: "mochiOS関連サービスを利用する際の基本的なルールです。",
        markdown: "/content/terms.md"
    },
    "/appstore/developer-terms/": {
        title: "AppStore開発者規約",
        eyebrow: "Developer Terms",
        subtitle: "mochiOS AppStoreでアプリを登録・配布する開発者向けの規約です。",
        markdown: "/content/appstore/developer-terms.md"
    },
    "/appstore/review-guidelines/": {
        title: "AppStore審査ガイドライン",
        eyebrow: "Review Guidelines",
        subtitle: "mochiOS AppStoreに提出されるアプリの審査方針です。",
        markdown: "/content/appstore/review-guidelines.md"
    }
};

function normalizePath(pathname) {
    if (!pathname.endsWith("/")) {
        pathname += "/";
    }

    return pathname;
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

function setActiveNav(path) {
    document.querySelectorAll("[data-policy-link]").forEach(link => {
        const href = normalizePath(new URL(link.href).pathname);
        link.classList.toggle("active", href === path);
    });
}

async function loadDocument() {
    const path = normalizePath(location.pathname);
    const doc = DOCS[path] || DOCS["/"];

    document.title = `${doc.title} - mochiOS Policy`;
    document.querySelector("[data-policy-eyebrow]").textContent = doc.eyebrow;
    document.querySelector("[data-policy-title]").textContent = doc.title;
    document.querySelector("[data-policy-subtitle]").textContent = doc.subtitle;
    document.querySelector("[data-policy-updated]").textContent = "最終更新: 読み込み中";
    setActiveNav(path);

    const container = document.querySelector("[data-policy-content]");
    container.innerHTML = '<div class="policy-loading">文書を読み込んでいます。</div>';

    try {
        const response = await fetch(doc.markdown, { cache: "no-store" });

        if (!response.ok) {
            console.error(`HTTP ${response.status}`);
        }

        const markdown = await response.text();
        const parsed = parseMarkdownDocument(markdown);

        if (parsed.meta.update) {
            document.querySelector("[data-policy-updated]").textContent = `最終更新: ${parsed.meta.update}`;
        } else {
            document.querySelector("[data-policy-updated]").textContent = "最終更新: 未記載";
        }

        container.innerHTML = `<article class="doc-card markdown">${renderMarkdown(parsed.body)}</article>`;
    } catch (error) {
        document.querySelector("[data-policy-updated]").textContent = "最終更新: 取得不可";
        container.innerHTML = `<div class="policy-error">文書を読み込めませんでした。<br><code>${escapeHtml(error.message)}</code></div>`;
    }
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

loadDocument().then(() => {});
