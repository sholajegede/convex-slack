import { defineApp } from "convex/server";
import convexSlack from "../../src/component/convex.config.js";

const app = defineApp();
app.use(convexSlack);

export default app;
