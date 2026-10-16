import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initStore } from "./lib/store";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "./styles/app.css";

initStore().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
