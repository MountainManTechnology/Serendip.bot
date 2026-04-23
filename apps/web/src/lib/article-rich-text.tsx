import type { ReactNode } from "react";

type FrameKind = "root" | "strong" | "em" | "code" | "link";

interface Frame {
  kind: FrameKind;
  children: ReactNode[];
  href?: string;
  key: string;
}

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, value: string) => {
    const lower = value.toLowerCase();
    if (lower in namedEntities) return namedEntities[lower] ?? entity;

    if (lower === "#39") return "'";

    if (lower.startsWith("#x")) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      if (Number.isNaN(codePoint)) return entity;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }

    if (lower.startsWith("#")) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      if (Number.isNaN(codePoint)) return entity;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }

    return entity;
  });
}

function sanitizeHref(rawHref: string): string | null {
  const decoded = decodeHtmlEntities(rawHref).trim();
  try {
    const url = new URL(decoded);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function materializeFrame(frame: Frame): ReactNode {
  switch (frame.kind) {
    case "strong":
      return <strong key={frame.key}>{frame.children}</strong>;
    case "em":
      return <em key={frame.key}>{frame.children}</em>;
    case "code":
      return <code key={frame.key}>{frame.children}</code>;
    case "link":
      return (
        <a
          key={frame.key}
          href={frame.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {frame.children}
        </a>
      );
    default:
      return frame.children;
  }
}

function normalizeTagName(tagName: string): FrameKind | null {
  switch (tagName) {
    case "b":
    case "strong":
      return "strong";
    case "i":
    case "em":
      return "em";
    case "code":
      return "code";
    case "a":
      return "link";
    default:
      return null;
  }
}

function findMatchingFrame(stack: Frame[], kind: FrameKind): number {
  for (let index = stack.length - 1; index > 0; index -= 1) {
    if (stack[index]?.kind === kind) return index;
  }
  return -1;
}

export function renderArticleRichText(html: string): ReactNode[] {
  if (!html) return [];

  const tokens = html.split(/(<[^>]+>)/g);
  const stack: Frame[] = [{ kind: "root", children: [], key: "root" }];
  const discardStack: string[] = [];
  let keyIndex = 0;

  const append = (node: ReactNode) => {
    if (node === "" || node === null || node === undefined) return;
    const current = stack[stack.length - 1];
    current?.children.push(node);
  };

  const flushTopFrame = () => {
    if (stack.length <= 1) return;
    const frame = stack.pop();
    if (!frame) return;
    append(materializeFrame(frame));
  };

  for (const token of tokens) {
    if (!token) continue;

    if (token.startsWith("<")) {
      const closingMatch = token.match(/^<\s*\/\s*([a-z0-9]+)\s*>$/i);
      if (closingMatch) {
        const tagName = closingMatch[1]?.toLowerCase() ?? "";

        if (discardStack.length > 0) {
          const expected = discardStack[discardStack.length - 1];
          if (expected === tagName) discardStack.pop();
          continue;
        }

        const kind = normalizeTagName(tagName);
        if (!kind) continue;

        const matchIndex = findMatchingFrame(stack, kind);
        if (matchIndex === -1) continue;
        while (stack.length - 1 >= matchIndex) {
          flushTopFrame();
        }
        continue;
      }

      const openingMatch = token.match(/^<\s*([a-z0-9]+)([^>]*)>$/i);
      if (!openingMatch) continue;

      const tagName = openingMatch[1]?.toLowerCase() ?? "";
      const attrs = openingMatch[2] ?? "";
      const selfClosing = /\/\s*>$/.test(token) || tagName === "br";

      if (discardStack.length > 0) {
        if (
          tagName === "script" ||
          tagName === "style" ||
          tagName === "iframe" ||
          tagName === "object"
        ) {
          discardStack.push(tagName);
        }
        continue;
      }

      if (
        tagName === "script" ||
        tagName === "style" ||
        tagName === "iframe" ||
        tagName === "object"
      ) {
        discardStack.push(tagName);
        continue;
      }

      if (tagName === "br") {
        append(<br key={`br-${keyIndex++}`} />);
        continue;
      }

      const kind = normalizeTagName(tagName);
      if (!kind || selfClosing) continue;

      if (kind === "link") {
        const hrefMatch = attrs.match(
          /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i,
        );
        const href = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4];
        const safeHref = href ? sanitizeHref(href) : null;
        if (!safeHref) continue;
        stack.push({
          kind,
          href: safeHref,
          children: [],
          key: `node-${keyIndex++}`,
        });
        continue;
      }

      stack.push({ kind, children: [], key: `node-${keyIndex++}` });
      continue;
    }

    if (discardStack.length > 0) continue;
    append(decodeHtmlEntities(token));
  }

  while (stack.length > 1) {
    flushTopFrame();
  }

  return stack[0]?.children ?? [];
}
