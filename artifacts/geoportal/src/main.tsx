// Workaround for known leaflet-draw v1.0.4 bug where readableArea accesses undeclared 'type' variable in strict mode
if (typeof window !== "undefined") {
  (window as any).type = undefined;
}

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
