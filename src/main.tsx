import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installLovableLatestMessageInterceptor } from "./lib/lovableLatestMessageInterceptor";
import { installLovableSocketGuard } from "./lib/lovableSocketGuard";

installLovableLatestMessageInterceptor();
installLovableSocketGuard();

createRoot(document.getElementById("root")!).render(<App />);
