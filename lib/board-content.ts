function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function formatInline(value: string) {
  let html = escapeHtml(value);

  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1.5 py-0.5 text-[0.92em] text-nzu-green">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, '<span class="line-through opacity-80">$1</span>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_full, label: string, rawUrl: string) => {
    const href = normalizeHttpUrl(rawUrl);
    const safeLabel = escapeHtml(label);
    if (!href) return safeLabel;
    return `<a href="${href}" target="_blank" rel="noreferrer" class="text-nzu-green underline underline-offset-4">${safeLabel}</a>`;
  });

  return html;
}

export function renderBoardContentToHtml(value: string) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let listMode: "ul" | "ol" | null = null;

  function closeList() {
    if (!listMode) return;
    parts.push(listMode === "ul" ? "</ul>" : "</ol>");
    listMode = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      parts.push('<div class="h-4"></div>');
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeList();
      parts.push(
        `<blockquote class="border-l-2 border-nzu-green/50 pl-4 text-white/68">${formatInline(trimmed.slice(2))}</blockquote>`
      );
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (listMode !== "ul") {
        closeList();
        parts.push('<ul class="list-disc space-y-2 pl-5 text-white/78">');
        listMode = "ul";
      }
      parts.push(`<li>${formatInline(trimmed.slice(2))}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      if (listMode !== "ol") {
        closeList();
        parts.push('<ol class="list-decimal space-y-2 pl-5 text-white/78">');
        listMode = "ol";
      }
      parts.push(`<li>${formatInline(orderedMatch[2])}</li>`);
      continue;
    }

    closeList();
    parts.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  return parts.join("");
}
