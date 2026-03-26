import "./styles.css";
import { createApp } from "./app";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("No se encontro el contenedor principal.");
}

createApp(root);

