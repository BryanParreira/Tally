/**
 * Pixel position of the caret inside a <textarea>, relative to the textarea.
 * Uses the usual mirror-element trick: copy the textarea's text styles into a
 * hidden div, fill it with the text up to the caret, and measure a marker.
 */
const COPIED = [
  "boxSizing", "width", "height", "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust", "lineHeight", "fontFamily",
  "textAlign", "textTransform", "textIndent", "letterSpacing", "wordSpacing", "tabSize",
] as const;

export function caretCoordinates(el: HTMLTextAreaElement, position: number): { top: number; left: number; height: number } {
  const div = document.createElement("div");
  document.body.appendChild(div);
  const style = div.style;
  const computed = getComputedStyle(el);
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.position = "absolute";
  style.visibility = "hidden";
  style.top = "0";
  style.left = "-9999px";
  for (const prop of COPIED) style[prop] = computed[prop];
  style.overflow = "hidden";

  div.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(position) || ".";
  div.appendChild(marker);
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.4;
  const result = { top: marker.offsetTop + parseFloat(computed.borderTopWidth), left: marker.offsetLeft + parseFloat(computed.borderLeftWidth), height: lineHeight };
  document.body.removeChild(div);
  return result;
}
