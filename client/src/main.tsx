import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function setAppHeight() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}
setAppHeight();
window.addEventListener("resize", setAppHeight);

createRoot(document.getElementById("root")!).render(<App />);
