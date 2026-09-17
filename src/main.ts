import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { runDonorBundleProbe } from "./game/spike/bundle-probe";
import "./style.css";

void runDonorBundleProbe();
createApp(App).use(createPinia()).mount("#app");
