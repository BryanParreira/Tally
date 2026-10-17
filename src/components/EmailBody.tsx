import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { mailBody, openExternal } from "../lib/native";
import type { MailAccount, MailMessage } from "../lib/types";

/** Bodies already fetched this session, so switching back and forth is instant. */
const bodies = new Map<string, string | null>();

const isRemote = (url: string | null) => !!url && /^\s*https?:/i.test(url);
const REMOTE_URL = /url\(\s*['"]?\s*https?:[^)]*\)/gi;
const HAS_REMOTE_URL = /url\(\s*['"]?\s*https?:/i;

/**
 * Make a sender's HTML safe to show. Scripts, forms, frames and event handlers
 * go; remote images (and tracking pixels) only load when you ask for them.
 */
export function prepareEmailHtml(html: string, showImages: boolean): { doc: string; blocked: number } {
  const d = new DOMParser().parseFromString(html, "text/html");
  d.querySelectorAll("script, noscript, iframe, frame, frameset, object, embed, form, meta[http-equiv], link, base").forEach((e) => e.remove());
  let blocked = 0;
  for (const el of d.querySelectorAll("*")) {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    if (showImages) continue;
    if (el.tagName === "IMG" && isRemote(el.getAttribute("src"))) {
      el.removeAttribute("src");
      el.removeAttribute("srcset");
      el.setAttribute("data-blocked", "");
      blocked++;
    }
    if (isRemote(el.getAttribute("background"))) {
      el.removeAttribute("background");
      blocked++;
    }
    const style = el.getAttribute("style");
    if (style && HAS_REMOTE_URL.test(style)) {
      el.setAttribute("style", style.replace(REMOTE_URL, "none"));
      blocked++;
    }
  }
  if (!showImages) {
    for (const s of d.querySelectorAll("style")) {
      const css = s.textContent ?? "";
      if (HAS_REMOTE_URL.test(css)) {
        s.textContent = css.replace(REMOTE_URL, "none");
        blocked++;
      }
    }
  }
  // Emails are designed for a white page; show them as the sender intended.
  const base = d.createElement("style");
  base.textContent =
    "html{color-scheme:light}body{margin:0;padding:20px;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:#1d1d1f;background:#fff;overflow-wrap:anywhere}" +
    "img{max-width:100%;height:auto}img[data-blocked]{display:none}table{max-width:100%!important}a{color:#0b63ce}";
  d.head.prepend(base);
  return { doc: `<!doctype html>${d.documentElement.outerHTML}`, blocked };
}

/** The email as it was written: rendered HTML when there is some, otherwise its text. */
export function EmailBody({ message, account }: { message: MailMessage; account?: MailAccount }) {
  const [html, setHtml] = useState<string | null | undefined>(() => (bodies.has(message.id) ? bodies.get(message.id) : undefined));
  const [showImages, setShowImages] = useState(false);
  const [height, setHeight] = useState(240);
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    setShowImages(false);
    if (bodies.has(message.id)) return setHtml(bodies.get(message.id));
    if (!account) return setHtml(null);
    let live = true;
    setHtml(undefined);
    mailBody(account, message.id)
      .then((h) => {
        bodies.set(message.id, h);
        if (live) setHtml(h);
      })
      .catch(() => live && setHtml(null));
    return () => {
      live = false;
    };
  }, [message.id, account]);

  useEffect(() => () => observer.current?.disconnect(), []);

  const prepared = useMemo(() => (html ? prepareEmailHtml(html, showImages) : null), [html, showImages]);

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const fit = () => setHeight(Math.max(120, doc.documentElement.scrollHeight));
    fit();
    observer.current?.disconnect();
    observer.current = new ResizeObserver(fit);
    observer.current.observe(doc.body);
    // Links open in your browser, never inside Kindred.
    doc.addEventListener("click", (e) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!link) return;
      e.preventDefault();
      const href = link.getAttribute("href") ?? "";
      if (/^(https?:|mailto:)/i.test(href)) openExternal(href).catch(() => undefined);
    });
  };

  if (html === undefined) {
    return (
      <div className="email-loading" aria-label="Loading email">
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (!prepared) return <div className="pane-text">{message.text || "(This message has no text.)"}</div>;
  return (
    <>
      {prepared.blocked > 0 && !showImages && (
        <div className="email-images">
          <ImageOff size={14} aria-hidden="true" />
          <span>Images are hidden to protect your privacy.</span>
          <button type="button" className="btn sm" onClick={() => setShowImages(true)}>
            Show images
          </button>
        </div>
      )}
      <div className="email-frame">
        <iframe ref={frame} title={message.subject || "Email"} sandbox="allow-same-origin" srcDoc={prepared.doc} onLoad={onLoad} style={{ height }} />
      </div>
    </>
  );
}
