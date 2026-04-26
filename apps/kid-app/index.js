import { registerRootComponent } from "expo";
import App from "./App";

// Own the root registration so the entry path resolves from this project's
// root, not from inside pnpm's virtual store. Expo's default AppEntry.js
// uses a relative `../../App` import that breaks under pnpm's nested layout.
registerRootComponent(App);
