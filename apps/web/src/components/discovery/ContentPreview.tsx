"use client";

import { useEffect, useRef, useCallback } from "react";
import type { DiscoverySite } from "@serendip-bot/types";
import { AdSlot } from "@/components/ads/AdSlot";

interface ContentPreviewProps {
  site: DiscoverySite | null;
  onClose: () => void;
}

/**
 * Sanitizes HTML on the client using DOMPurify.
 * DOMPurify is browser-only; we lazy-init to avoid SSR issues.
 */
let purify: { sanitize: (html: string, opts?: object) => string } | null = null;

function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return "";
  if (!purify) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DOMPurify = require("dompurify");
    // DOMPurify v3 exports a factory when require()'d; call it with window.
    purify = typeof DOMPurify === "function" ? DOMPurify(window) : DOMPurify;
  }
  return purify!.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "b",
      "i",
      "em",
      "strong",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "img",
      "figure",
      "figcaption",
      "hr",
      "span",
      "div",
      "section",
      "article",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
    FORCE_BODY: true,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_SCRIPTS: true,
  });
}

export function ContentPreview({ site, onClose }: ContentPreviewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (site) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [site]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [onClose]);

  if (!site) return null;

  const safeHtml = site.contentSummary
    ? sanitizeHtml(`<div>${site.contentSummary}</div>`)
    : "";

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl bg-white p-0 overflow-hidden backdrop:bg-black/50"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900 line-clamp-2">
            {site.title}
          </h2>
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-600 hover:underline truncate block"
          >
            {site.url}
          </a>
        </div>
        <button
          onClick={onClose}
          aria-label="Close preview"
          className="shrink-0 p-2.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto px-6 py-5 max-h-[calc(90vh-80px)]">
        {/* Why blurb */}
        {site.whyBlurb && (
          <p className="mb-5 text-sm italic text-gray-500 bg-violet-50 rounded-xl px-4 py-3 border-l-4 border-violet-300">
            {site.whyBlurb}
          </p>
        )}

        {/* Sanitized content */}
        {safeHtml ? (
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify
            dangerouslySetInnerHTML={{ __html: safeHtml }}
            className="prose prose-sm prose-gray max-w-none"
          />
        ) : (
          <p className="text-gray-500 text-sm">{site.description}</p>
        )}

        {/* Open externally */}
        <div className="mt-8 pt-4 border-t border-gray-100">
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            Open Original Site
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>

        {/* In-article ad slot */}
        <AdSlot slot="0000000001" className="rounded-lg mt-6" />
      </div>
    </dialog>
  );
}
